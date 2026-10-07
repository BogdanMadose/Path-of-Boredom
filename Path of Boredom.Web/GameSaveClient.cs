using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.Web;

/// <summary>
/// The single trusted gateway from Blazor to ApiService for saves and rankings. Every call to the
/// API's /game/... endpoints goes through here so the identity headers, shared-secret auth, and
/// error-code-to-friendly-message translation only need to be written once. See the Web project
/// README for the bigger picture of why this exists as a choke point rather than letting JS call
/// the API directly (JS has no access to the authenticated ClaimsPrincipal or the shared secret).
/// </summary>
/// <param name="client">The HttpClient registered in Program.cs, pre-configured with the ApiService base address, a 15s timeout, and Aspire's service discovery/resilience handlers.</param>
/// <param name="serviceOptions">The bound SaveServiceOptions, giving access to the shared API key used to authenticate every outgoing request.</param>
public sealed class GameSaveClient(HttpClient client, IOptions<SaveServiceOptions> serviceOptions)
{
    /// <summary>
    /// Sends the current run's save snapshot (as captured by arpg-save.js's captureSnapshot()) to
    /// the API to be persisted for the signed-in Windows user. Called both for manual "Save" clicks
    /// and automatic checkpoint saves.
    /// </summary>
    /// <param name="user">The current request's authenticated ClaimsPrincipal, used to build the identity headers.</param>
    /// <param name="snapshot">The save payload as a raw JsonElement, expected to be a JSON object with (at least) a numeric "version" property.</param>
    /// <returns>A GameSaveResult describing success/failure with a message suitable to show directly to the player.</returns>
    public async Task<GameSaveResult> SaveAsync(ClaimsPrincipal user, JsonElement snapshot)
    {
        // Reject anything that isn't a JSON object outright — cheaper than sending a malformed
        // request to the API and parsing its rejection.
        if (snapshot.ValueKind != JsonValueKind.Object) return new(false, "Invalid save request.");

        // Enforce the same 64KB cap the API enforces, so an oversized save fails fast client-side
        // with a clear message instead of a generic HTTP error from the server.
        var json = snapshot.GetRawText();
        if (Encoding.UTF8.GetByteCount(json) > 64 * 1024) return new(false, "This run is too large to save.");

        using var request = CreateRequest(HttpMethod.Put, user);
        if (request is null) return new(false, "Windows sign-in is required. Reload the page to sign in.");
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        // Pull the save's format version out just for building a more specific error message below
        // (SendAsync uses it to say e.g. "this game uses save format 14" in the UnsupportedSaveVersion case).
        var version = snapshot.TryGetProperty("version", out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) ? number : (int?)null;
        return await SendAsync(request, loading: false, version);
    }

    /// <summary>
    /// Fetches the signed-in user's stored save from the API, if one exists. Called from the
    /// "Load" button and from the JS-side retry flow after a failed load.
    /// </summary>
    public async Task<GameSaveResult> LoadAsync(ClaimsPrincipal user)
    {
        using var request = CreateRequest(HttpMethod.Get, user);
        if (request is null) return new(false, "Windows sign-in is required. Reload the page to sign in.");
        return await SendAsync(request, loading: true);
    }

    /// <summary>
    /// Shared request-sending logic for both save and load, responsible for translating every HTTP
    /// status code and API error code into a message meaningful to a player or admin. This is the
    /// file to edit whenever a new error code is added on the API side (GameSaveEndpoints.cs) —
    /// otherwise it'll silently fall through to one of the generic fallback messages below.
    /// </summary>
    /// <param name="request">The fully built HTTP request (auth headers already attached by CreateRequest).</param>
    /// <param name="loading">True for a load request (changes which set of error messages applies), false for a save request.</param>
    /// <param name="saveVersion">The save format version being written, used only to build a more specific error message on version mismatches; null for loads.</param>
    private async Task<GameSaveResult> SendAsync(HttpRequestMessage request, bool loading, int? saveVersion = null)
    {
        try
        {
            using var response = await client.SendAsync(request);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                // Loading before ever saving — not an error, just means there's nothing to resume.
                return new(false, "No server save found for your Windows account yet.");
            }

            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                // This means the Bearer secret (SaveServiceOptions.ApiKey) doesn't match between Web
                // and ApiService — almost always a deployment/config mistake, not a player-caused issue.
                return new(false, "The API rejected the server identity. Verify both services use the same private SaveService configuration.");
            }

            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.InternalServerError)
                {
                    // The API returns a structured SaveApiError body for these two status codes; try to
                    // read it, but tolerate it being missing/malformed (e.g. an older API build that
                    // doesn't emit this shape yet) rather than throwing.
                    SaveApiError? error = null;
                    try { error = await response.Content.ReadFromJsonAsync<SaveApiError>(); }
                    catch (JsonException) { }
                    var format = saveVersion?.ToString() ?? "unknown";
                    var reference = string.IsNullOrWhiteSpace(error?.Reference) ? "" : $" API log reference: {error.Reference}.";
                    if (loading)
                    {
                        return new(false, error?.Code switch
                        {
                            "CorruptStoredSave" => $"Your server save file contains unreadable JSON. It has not been changed. If your run is still open, use Save or Retry checkpoint save to back up the damaged file and save the current run. Otherwise ask the administrator to restore a known-good backup.{reference}",
                            "SaveStorageUnavailable" => $"The API could not read its save folder or file. Check the API process's folder permissions and API logs. Your current run is unchanged.{reference}",
                            _ => "The API could not load the server save. Your current run is unchanged; check the API logs."
                        });
                    }
                    return new(false, error?.Code switch
                    {
                        "UnsupportedSaveVersion" => $"This game uses save format {format}, but the API supports up to {error.SupportedVersion}. Deploy/restart ApiService from the matching Web release, then retry. Keep this game open; reloading may lose unsaved progress.",
                        "InvalidSaveState" => $"The API supports this format but rejected the run's save data (format {format}, InvalidSaveState). Keep this game open and report this error; your previous server save is unchanged.",
                        "InvalidSaveEnvelope" or "InvalidSaveJson" => $"The API could not read the save request ({error.Code}). No save was written. Keep this game open and check the API logs.{reference}",
                        "SaveStorageJsonError" => $"The request passed validation, but server storage could not process the save JSON. No save was replaced. Keep this game open and check the API logs.{reference}",
                        "SaveStorageUnavailable" => $"The request passed validation, but the API could not access its save folder or file. Check the API process's folder permissions, available disk space, and API logs. Keep this game open and retry after correcting storage access.{reference}",
                        _ when response.StatusCode == HttpStatusCode.InternalServerError => "The API encountered a server error while saving. Keep this game open and check the API logs.",
                        _ => $"The API rejected save format {format} without a diagnostic code. It may be an older API build: deploy/restart ApiService to match Web, then retry without reloading this game. Your previous server save is unchanged."
                    });
                }
                return new(false, "The API could not complete the request. Your current run is unchanged.");
            }

            // Success path: the API returns the save/load payload as raw JSON, plus a couple of
            // side-channel flags we surface back to the caller.
            var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
            var unlocked = payload.TryGetProperty("endlessUnlocked", out var flag) && flag.ValueKind == JsonValueKind.True;
            if (loading) return new(true, "Server save loaded. Resume when ready.", payload, unlocked);

            // "recoveredFromCorruptSave" is set by the API when this save request replaced a stored
            // file that couldn't be parsed as JSON (see GameSaveStore.cs's .corrupt backup behavior) —
            // worth telling the player explicitly since it means their *previous* save is gone for good.
            var recovered = payload.TryGetProperty("recoveredFromCorruptSave", out var recovery) && recovery.ValueKind == JsonValueKind.True;
            return new(true, recovered
                ? "Current run saved. The unreadable previous file was backed up on the server. Progress or unlocks only in that damaged file could not be recovered."
                : "Run saved on the server. You can safely close this page.", EndlessUnlocked: unlocked);
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
        {
            // Network-level failure (API down, DNS/service-discovery failure, timeout, malformed
            // response body). Deliberately swallowed into a friendly result rather than allowed to
            // bubble up and crash the Blazor circuit mid-game.
            return new(false, "Save API unavailable. Start Path of Boredom.AppHost and try again.");
        }
    }

    /// <summary>
    /// Ensures the signed-in user has a rankings profile row on the API, called once on page load
    /// (see Home.razor's OnInitializedAsync). Failure here just means score submissions might not
    /// show up correctly until retried; it isn't fatal to gameplay.
    /// </summary>
    public async Task<bool> RegisterPlayerAsync(ClaimsPrincipal user) => await SendRankingAsync(user, null);

    /// <summary>
    /// Validates and submits a score/build snapshot for the leaderboard. Validation happens
    /// client-side first via RankingRules.IsValid purely to avoid a wasted round-trip for an
    /// obviously malformed submission — the API re-validates independently and is the real gate.
    /// </summary>
    public async Task<bool> SubmitScoreAsync(ClaimsPrincipal user, ScoreSubmission submission) =>
        RankingRules.IsValid(submission) && await SendRankingAsync(user, submission);

    /// <summary>
    /// Shared plumbing for both ranking calls. A null submission means "just register/touch my
    /// profile" (POST /game/rankings/profile); a non-null submission means "submit this score"
    /// (PUT /game/rankings/). Unlike SendAsync above, ranking failures are collapsed to a plain
    /// bool — there's no rankings UI state detailed enough to need per-error-code messages.
    /// </summary>
    private async Task<bool> SendRankingAsync(ClaimsPrincipal user, ScoreSubmission? submission)
    {
        using var request = CreateRequest(submission is null ? HttpMethod.Post : HttpMethod.Put, user,
            submission is null ? "/game/rankings/profile" : "/game/rankings/");
        if (request is null) return false;
        if (submission is not null) request.Content = JsonContent.Create(submission);
        try
        {
            using var response = await client.SendAsync(request);
            return response.IsSuccessStatusCode;
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException)
        {
            return false;
        }
    }

    /// <summary>
    /// Fetches a leaderboard slice for the given difficulty/mode/class/patch combination, used by
    /// Rankings.razor to render its tables. Returns null both on validation failure (bad query
    /// parameters) and on any transport/parsing failure — callers treat both the same way
    /// (show "rankings unavailable" rather than distinguishing the reason).
    /// </summary>
    /// <param name="heroClass">A class key, or "all" to include every class in one combined board.</param>
    /// <param name="patch">Which patch's board to fetch; defaults to the current patch.</param>
    public async Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(ClaimsPrincipal user, string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch)
    {
        // Validate query parameters before making the call at all — an invalid combination here
        // would just be an internal bug (all these values come from a fixed set of UI options), so
        // failing closed with null is safer than sending a request the API would also reject.
        if (!RankingRules.IsDifficulty(difficulty) || !RankingRules.IsMode(mode)
            || !RankingRules.IsPatch(patch) || heroClass != "all" && !RankingRules.IsClass(heroClass)) return null;
        using var request = CreateRequest(HttpMethod.Get, user, $"/game/rankings/?difficulty={difficulty}&mode={mode}&heroClass={heroClass}&patch={patch}");
        if (request is null) return null;
        try
        {
            using var response = await client.SendAsync(request);
            return response.IsSuccessStatusCode ? await response.Content.ReadFromJsonAsync<List<RankingRow>>() : null;
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException or JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Builds an outgoing request pre-populated with the identity headers the API's
    /// SaveServiceAuthenticationHandler expects: a Bearer token carrying the shared secret, plus
    /// the Windows username (and SID, if available) of the currently signed-in user. Returns null
    /// if the incoming ClaimsPrincipal doesn't actually have a usable Windows identity attached —
    /// callers treat null as "not signed in" and surface a re-login prompt rather than sending a
    /// request that would just get rejected anyway.
    /// </summary>
    /// <param name="method">HTTP method for the request (GET for loads/rankings-fetch, PUT for saves/score-submits, POST for profile registration).</param>
    /// <param name="user">The current request's authenticated ClaimsPrincipal.</param>
    /// <param name="path">The API route to call; defaults to the save endpoint since that's the most common caller.</param>
    private HttpRequestMessage? CreateRequest(HttpMethod method, ClaimsPrincipal user, string path = "/game/save")
    {
        // Find the first authenticated identity with a non-empty name — Negotiate auth normally
        // gives exactly one identity, but this defends against edge cases with multiple identities
        // (e.g. anonymous + Windows) attached to the same principal.
        var identity = user.Identities.FirstOrDefault(identity => identity.IsAuthenticated && !string.IsNullOrWhiteSpace(identity.Name));
        // Sanity-check the username itself before it goes anywhere near an HTTP header or gets used
        // as part of a file name on the API side (see GameSaveStore.cs) — reject anything empty,
        // implausibly long, or containing control characters.
        if (identity?.Name is not { Length: > 0 and <= 256 } name || name.Any(char.IsControl)) return null;

        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", serviceOptions.Value.ApiKey);
        // URL-encode the username since it can contain characters that aren't valid raw header values
        // (e.g. spaces); the API decodes this back with Uri.UnescapeDataString.
        request.Headers.Add(SaveServiceOptions.UserNameHeader, Uri.EscapeDataString(name));
        // The SID is optional — older/edge-case identities might not carry a PrimarySid claim — but
        // when present it's what the API actually uses to key storage, since it's stable even if a
        // Windows account gets renamed.
        var sid = identity.FindFirst(ClaimTypes.PrimarySid)?.Value;
        if (!string.IsNullOrEmpty(sid)) request.Headers.Add(SaveServiceOptions.UserSidHeader, sid);
        return request;
    }
}

/// <summary>
/// Mirrors the structured error body the API returns for 400/500 responses on save/load requests.
/// Every property is optional because older API builds (or unexpected failures) might not populate
/// all of them, or any of them.
/// </summary>
/// <param name="Code">A short machine-readable error code (e.g. "InvalidSaveJson", "UnsupportedSaveVersion") — see GameSaveClient.SendAsync's switch expressions for the full list this client understands.</param>
/// <param name="SupportedVersion">For UnsupportedSaveVersion specifically: the highest save format version this API build actually supports.</param>
/// <param name="Reference">An opaque log correlation id, if the API logged additional detail server-side that an admin could look up.</param>
public sealed record SaveApiError(string? Code, int? SupportedVersion, string? Reference = null);
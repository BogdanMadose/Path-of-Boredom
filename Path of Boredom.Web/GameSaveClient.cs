using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.Web;

public sealed class GameSaveClient(HttpClient client, IOptions<SaveServiceOptions> serviceOptions)
{
    public async Task<GameSaveResult> SaveAsync(ClaimsPrincipal user, JsonElement snapshot)
    {
        if (snapshot.ValueKind != JsonValueKind.Object)
        {
            return new(false, "Invalid save request.");
        }

        var json = snapshot.GetRawText();
        if (Encoding.UTF8.GetByteCount(json) > 64 * 1024)
        {
            return new(false, "This run is too large to save.");
        }

        using var request = CreateRequest(HttpMethod.Put, user);
        if (request is null) return new(false, "Windows sign-in is required. Reload the page to sign in.");
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        var version = snapshot.TryGetProperty("version", out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) ? number : (int?)null;
        return await SendAsync(request, loading: false, version);
    }

    public async Task<GameSaveResult> LoadAsync(ClaimsPrincipal user)
    {
        using var request = CreateRequest(HttpMethod.Get, user);
        if (request is null) return new(false, "Windows sign-in is required. Reload the page to sign in.");
        return await SendAsync(request, loading: true);
    }

    private async Task<GameSaveResult> SendAsync(HttpRequestMessage request, bool loading, int? saveVersion = null)
    {
        try
        {
            using var response = await client.SendAsync(request);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                return new(false, "No server save found for your Windows account yet.");
            }

            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                return new(false, "The API rejected the server identity. Verify both services use the same private SaveService configuration.");
            }

            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.InternalServerError)
                {
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

            var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
            var unlocked = payload.TryGetProperty("endlessUnlocked", out var flag) && flag.ValueKind == JsonValueKind.True;
            if (loading)
            {
                return new(true, "Server save loaded. Resume when ready.", payload, unlocked);
            }

            var recovered = payload.TryGetProperty("recoveredFromCorruptSave", out var recovery) && recovery.ValueKind == JsonValueKind.True;
            return new(true, recovered
                ? "Current run saved. The unreadable previous file was backed up on the server. Progress or unlocks only in that damaged file could not be recovered."
                : "Run saved on the server. You can safely close this page.", EndlessUnlocked: unlocked);
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException)
        {
            return new(false, "Save API unavailable. Start Path of Boredom.AppHost and try again.");
        }
    }

    public async Task<bool> RegisterPlayerAsync(ClaimsPrincipal user) =>
        await SendRankingAsync(user, null);

    public async Task<bool> SubmitScoreAsync(ClaimsPrincipal user, ScoreSubmission submission) =>
        RankingRules.IsValid(submission) && await SendRankingAsync(user, submission);

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

    public async Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(ClaimsPrincipal user, string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch)
    {
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

    private HttpRequestMessage? CreateRequest(HttpMethod method, ClaimsPrincipal user, string path = "/game/save")
    {
        var identity = user.Identities.FirstOrDefault(identity => identity.IsAuthenticated && !string.IsNullOrWhiteSpace(identity.Name));
        if (identity?.Name is not { Length: > 0 and <= 256 } name || name.Any(char.IsControl)) return null;

        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", serviceOptions.Value.ApiKey);
        request.Headers.Add(SaveServiceOptions.UserNameHeader, Uri.EscapeDataString(name));
        var sid = identity.FindFirst(ClaimTypes.PrimarySid)?.Value;
        if (!string.IsNullOrEmpty(sid)) request.Headers.Add(SaveServiceOptions.UserSidHeader, sid);
        return request;
    }
}

public sealed record SaveApiError(string? Code, int? SupportedVersion, string? Reference = null);
public sealed record GameSaveResult(bool Success, string Message, JsonElement? Save = null, bool EndlessUnlocked = false);

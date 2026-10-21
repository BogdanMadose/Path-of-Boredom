using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Path_of_Boredom.Game;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.Web;

/// <summary>
/// Desktop/browser session. The player signs in with Google (OpenID Connect, see Program.cs) and
/// this class sends their Google ID token to the API as a Bearer token, exactly like the mobile app,
/// so the same Google account reaches the same cloud save, display name and rankings on both.
/// There is no device file here: the cloud save is the save.
/// </summary>
public sealed class WebCloudGameSession(IHttpClientFactory httpFactory, AuthenticationStateProvider authenticationState,
    GoogleTokenStore tokens, NavigationManager navigation) : IGameSession, ICloudGameSession
{
    public const string ApiClientName = "api";
    private const int MaximumSaveBytes = 64 * 1024;
    private readonly SemaphoreSlim gate = new(1, 1);
    private HttpClient? http;
    private string? subject;
    private bool initialized;
    private long? expectedRevision;
    private long? observedRevision;
    private JsonElement? observedSave;
    private string player = string.Empty;
    private bool deleted;
    private string message = "Signing in with Google…";

    private HttpClient Http => http ??= httpFactory.CreateClient(ApiClientName);

    public CloudAccountStatus AccountStatus => new(true, subject is not null && tokens.Has(subject),
        subject is not null && initialized && expectedRevision is null, observedSave is not null,
        player, message, observedRevision, deleted);

    private async Task<string?> GetSubjectAsync()
    {
        var user = (await authenticationState.GetAuthenticationStateAsync()).User;
        return user.Identity?.IsAuthenticated == true
            ? user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier) : null;
    }

    private async Task<HttpRequestMessage?> RequestAsync(HttpMethod method, string path)
    {
        subject ??= await GetSubjectAsync();
        var token = subject is null ? null : await tokens.GetIdTokenAsync(subject);
        if (token is null)
        {
            message = "Google sign-in expired. Reload the page to sign in again; your open run is unchanged.";
            return null;
        }
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    private async Task<HttpResponseMessage?> SendAsync(HttpRequestMessage request)
    {
        var response = await Http.SendAsync(request);
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            if (subject is not null) tokens.Remove(subject);
            message = await IsDeletedSessionAsync(response)
                ? "This session belongs to a deleted game account. Reload the page and continue with Google to start afresh."
                : "Google sign-in expired. Reload the page to sign in again; your open run is unchanged.";
        }
        return response;
    }

    private static async Task<bool> IsDeletedSessionAsync(HttpResponseMessage response)
    {
        try
        {
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            return body.ValueKind == JsonValueKind.Object && body.TryGetProperty("code", out var code)
                && code.ValueKind == JsonValueKind.String && code.GetString() == "AccountDeleted";
        }
        catch (Exception exception) when (exception is JsonException or NotSupportedException) { return false; }
    }

    private async Task EnsureInitializedAsync()
    {
        if (initialized) return;
        using (var account = await RequestAsync(HttpMethod.Get, "/game/account/"))
        {
            if (account is null) return;
            using var response = await SendAsync(account);
            if (response is null || !response.IsSuccessStatusCode) return;
            var identity = await response.Content.ReadFromJsonAsync<VerifiedIdentity>();
            if (identity is null || string.IsNullOrWhiteSpace(identity.Name)) throw new JsonException();
            player = identity.Name;
        }
        await ReadCloudMetadataAsync();
        // Opening the game acknowledges the current cloud revision; later writes must match it.
        expectedRevision = observedRevision;
        initialized = true;
    }

    private async Task ReadCloudMetadataAsync()
    {
        using var request = await RequestAsync(HttpMethod.Get, "/game/save");
        if (request is null) return;
        using var response = await SendAsync(request);
        if (response is null) return;
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            observedRevision = 0;
            observedSave = null;
            message = "No cloud save yet. Save a run to create one.";
            return;
        }
        if (response.StatusCode == HttpStatusCode.Unauthorized) return;
        response.EnsureSuccessStatusCode();
        var save = await response.Content.ReadFromJsonAsync<JsonElement>();
        if (!save.TryGetProperty("revision", out var revision) || !revision.TryGetInt64(out var value) || value < 1
            || !save.TryGetProperty("state", out var state) || state.ValueKind != JsonValueKind.Object)
            throw new JsonException();
        observedRevision = value;
        observedSave = save.Clone();
        message = "Cloud save available. Load to continue it, or Save to replace it with your current run.";
    }

    public async Task<string> GetPlayerNameAsync()
    {
        await gate.WaitAsync();
        try { await EnsureInitializedAsync(); }
        catch (Exception exception) when (IsRecoverable(exception)) { message = "The sign-in service is unavailable. Reload when connected."; }
        finally { gate.Release(); }
        return player;
    }

    public async Task<bool> RegisterPlayerAsync() => await RankingRequestAsync(HttpMethod.Post, "/game/rankings/profile");

    public async Task<bool> SubmitScoreAsync(ScoreSubmission submission) =>
        RankingRules.IsValid(submission) && await RankingRequestAsync(HttpMethod.Put, "/game/rankings/", submission);

    private async Task<bool> RankingRequestAsync(HttpMethod method, string path, ScoreSubmission? score = null)
    {
        await gate.WaitAsync();
        try
        {
            using var request = await RequestAsync(method, path);
            if (request is null) return false;
            if (score is not null) request.Content = JsonContent.Create(score);
            using var response = await SendAsync(request);
            return response?.IsSuccessStatusCode == true;
        }
        catch (Exception exception) when (IsRecoverable(exception)) { return false; }
        finally { gate.Release(); }
    }

    public async Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch)
    {
        if (!RankingRules.IsDifficulty(difficulty) || !RankingRules.IsMode(mode)
            || !RankingRules.IsPatch(patch) || heroClass != "all" && !RankingRules.IsClass(heroClass)) return null;
        await gate.WaitAsync();
        try
        {
            using var request = await RequestAsync(HttpMethod.Get,
                $"/game/rankings/?difficulty={Uri.EscapeDataString(difficulty)}&mode={Uri.EscapeDataString(mode)}&heroClass={Uri.EscapeDataString(heroClass)}&patch={Uri.EscapeDataString(patch)}");
            if (request is null) return null;
            using var response = await SendAsync(request);
            return response?.IsSuccessStatusCode == true ? await response.Content.ReadFromJsonAsync<List<RankingRow>>() : null;
        }
        catch (Exception exception) when (IsRecoverable(exception)) { return null; }
        finally { gate.Release(); }
    }

    public async Task<GameSaveResult> SaveAsync(JsonElement snapshot)
    {
        if (snapshot.ValueKind != JsonValueKind.Object) return new(false, "Invalid save request.");
        var json = snapshot.GetRawText();
        if (Encoding.UTF8.GetByteCount(json) > MaximumSaveBytes) return new(false, "This run is too large to save.");
        await gate.WaitAsync();
        try
        {
            await EnsureInitializedAsync();
            if (!initialized) return new(false, message);
            if (expectedRevision is null)
                return new(false, "Cloud sync is paused because another device changed the save. Open Account & cloud and choose which save to keep. Nothing was overwritten.");
            return await UploadAsync(snapshot, json, expectedRevision.Value);
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { return new(false, "Save API unavailable. Keep this game open and try again when connected."); }
        finally { gate.Release(); }
    }

    private async Task<GameSaveResult> UploadAsync(JsonElement snapshot, string json, long revision)
    {
        using var request = await RequestAsync(HttpMethod.Put, "/game/save");
        if (request is null) return new(false, message);
        request.Headers.IfMatch.Add(new EntityTagHeaderValue($"\"{revision}\""));
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        using var response = await SendAsync(request);
        if (response is null) return new(false, message);
        if (response.StatusCode == HttpStatusCode.Conflict)
        {
            expectedRevision = null;
            observedRevision = null;
            observedSave = null;
            return new(false, "Cloud conflict: another device changed the save. Open Account & cloud, refresh, then choose which save to keep. Nothing was overwritten.");
        }
        if (response.StatusCode == HttpStatusCode.Unauthorized) return new(false, message);
        if (!response.IsSuccessStatusCode)
        {
            if (response.StatusCode == HttpStatusCode.BadRequest)
            {
                var error = await response.Content.ReadFromJsonAsync<SaveApiError>();
                if (error?.Code == "UnsupportedSaveVersion")
                    return new(false, "The API needs the latest save-format update. Keep this game open; deploy the updated API, then retry Save.");
            }
            return new(false, "The API could not complete the save. Your current run is unchanged; keep this game open and retry.");
        }
        var receipt = await response.Content.ReadFromJsonAsync<SaveReceipt>();
        if (receipt is null || receipt.Revision <= revision) throw new JsonException();
        expectedRevision = observedRevision = receipt.Revision;
        observedSave = JsonSerializer.SerializeToElement(new
        {
            version = snapshot.GetProperty("version"), state = snapshot.GetProperty("state"),
            endlessUnlocked = receipt.EndlessUnlocked, revision = receipt.Revision
        });
        return new(true, "Run saved to your Google account. Continue on any device.", EndlessUnlocked: receipt.EndlessUnlocked);
    }

    public async Task<string?> SaveProfileAsync(string json)
    {
        if (Encoding.UTF8.GetByteCount(json) > 8 * 1024) return null;
        await gate.WaitAsync();
        try
        {
            await EnsureInitializedAsync();
            if (!initialized) return null;
            using var request = await RequestAsync(HttpMethod.Put, "/game/profile");
            if (request is null) return null;
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
            using var response = await SendAsync(request);
            if (response is null) return null;
            if (response.StatusCode == HttpStatusCode.Conflict) return await response.Content.ReadAsStringAsync();
            return response.IsSuccessStatusCode ? string.Empty : null;
        }
        catch (Exception exception) when (IsRecoverable(exception)) { return null; }
        finally { gate.Release(); }
    }

    public async Task<string?> LoadProfileAsync()
    {
        await gate.WaitAsync();
        try
        {
            await EnsureInitializedAsync();
            if (!initialized) return null;
            using var request = await RequestAsync(HttpMethod.Get, "/game/profile");
            if (request is null) return null;
            using var response = await SendAsync(request);
            return response?.IsSuccessStatusCode == true ? await response.Content.ReadAsStringAsync() : null;
        }
        catch (Exception exception) when (IsRecoverable(exception)) { return null; }
        finally { gate.Release(); }
    }

    public async Task<GameSaveResult> LoadAsync()
    {
        await gate.WaitAsync();
        try
        {
            await EnsureInitializedAsync();
            if (!initialized) return new(false, message);
            await ReadCloudMetadataAsync();
            if (observedSave is not { } save) return new(false, "No cloud save found for your Google account yet.");
            expectedRevision = observedRevision;
            var unlocked = save.TryGetProperty("endlessUnlocked", out var flag) && flag.ValueKind == JsonValueKind.True;
            return new(true, "Cloud save loaded. Resume when ready.", save, unlocked);
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { return new(false, "Cloud load unavailable. Your current run is unchanged; retry when connected."); }
        finally { gate.Release(); }
    }

    public Task<CloudAccountStatus> SignInAsync()
    {
        navigation.NavigateTo("/account/login-google", forceLoad: true);
        return Task.FromResult(AccountStatus);
    }

    public Task<CloudAccountStatus> SignInWithAppleAsync()
    {
        navigation.NavigateTo("/account/login-apple", forceLoad: true);
        return Task.FromResult(AccountStatus);
    }

    public Task<CloudAccountStatus> SignOutAsync()
    {
        navigation.NavigateTo("/account/logout", forceLoad: true);
        return Task.FromResult(AccountStatus);
    }

    public async Task<CloudAccountStatus> RefreshCloudAsync()
    {
        await gate.WaitAsync();
        try
        {
            await EnsureInitializedAsync();
            if (initialized) await ReadCloudMetadataAsync();
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { message = "Could not read cloud metadata. No save was changed. Retry when connected."; }
        finally { gate.Release(); }
        return AccountStatus;
    }

    public async Task<CloudAccountStatus> ChangeDisplayNameAsync(string name)
    {
        await gate.WaitAsync();
        try
        {
            if (!PlayerDisplayNameRules.TryNormalize(name, out var normalized))
            { message = PlayerDisplayNameRules.Guidance; return AccountStatus; }
            using var request = await RequestAsync(HttpMethod.Put, "/game/account/display-name");
            if (request is null) return AccountStatus;
            request.Content = JsonContent.Create(new { name = normalized });
            using var response = await SendAsync(request);
            if (response is null) return AccountStatus;
            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode == HttpStatusCode.Conflict) message = "That player name is already taken. Choose another nickname.";
                else if (response.StatusCode != HttpStatusCode.Unauthorized) message = "Player name was not changed. Check the connection and that the latest API is deployed.";
                return AccountStatus;
            }
            var receipt = await response.Content.ReadFromJsonAsync<DisplayNameReceipt>();
            if (receipt is null || !PlayerDisplayNameRules.TryNormalize(receipt.Name, out var verified)) throw new JsonException();
            player = verified;
            message = $"Player name updated to {player}. Your saves and scores are unchanged.";
            return AccountStatus;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { message = "Could not confirm the player name change. Reload to check; your progress is safe."; return AccountStatus; }
        finally { gate.Release(); }
    }

    public async Task<GameSaveResult> ResolveCloudSaveAsync(bool useCloud)
    {
        await gate.WaitAsync();
        try
        {
            if (observedRevision is null) return new(false, "Refresh cloud metadata first.");
            expectedRevision = observedRevision;
            message = useCloud
                ? "Cloud save kept. Choose Load saved run to continue it."
                : "Your next Save will replace the cloud save.";
            return new(true, message);
        }
        finally { gate.Release(); }
    }

    public async Task<CloudAccountStatus> DeleteAccountAsync()
    {
        await gate.WaitAsync();
        try
        {
            using var request = await RequestAsync(HttpMethod.Delete, "/game/account/");
            if (request is null) return AccountStatus;
            using var response = await SendAsync(request);
            if (response is null) return AccountStatus;
            if (response.StatusCode != HttpStatusCode.NoContent)
            {
                if (response.StatusCode != HttpStatusCode.Unauthorized) message = "Account deletion was not confirmed. Retry when connected.";
                return AccountStatus;
            }
            deleted = true;
            expectedRevision = observedRevision = null;
            observedSave = null;
            message = "Game account deleted. Continue with Google to create a new account.";
            if (subject is not null) tokens.Remove(subject);
            return AccountStatus;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { message = "Deletion could not be confirmed. Retry when connected."; return AccountStatus; }
        finally { gate.Release(); }
    }

    private static bool IsRecoverable(Exception exception) => exception is HttpRequestException or TaskCanceledException
        or TimeoutException or JsonException or InvalidOperationException or NotSupportedException;

    private sealed record VerifiedIdentity(string Subject, string Name);
    private sealed record DisplayNameReceipt(string Name);
    private sealed record SaveReceipt(long Revision, bool EndlessUnlocked);
    private sealed record SaveApiError(string? Code);
}

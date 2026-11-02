using Microsoft.JSInterop;
using Path_of_Boredom.Game;
using Path_of_Boredom.ServiceDefaults;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Path_of_Boredom.Itch;

/// <summary>
/// Browser counterpart of the mobile cloud session: localStorage saves, Google/Apple sign-in and
/// optimistic-revision cloud sync against the same API.
/// </summary>
public sealed class BrowserGameSession(IJSRuntime js, BrowserSaveStore local, HttpClient http) : IGameSession, ICloudGameSession
{
    private const string AutoSignInKey = "pob.itch.auto-sign-in";
    private const string AppleSessionKey = "pob.itch.apple-session";
    private const string OfflinePlayer = "Browser player";
    private readonly SemaphoreSlim gate = new(1, 1);
    private string? token;
    private bool appleSession;
    private bool restoreAttempted;
    private bool deleted;
    private long? expectedRevision;
    private long? observedRevision;
    private IReadOnlyList<GameSaveSlotInfo> observedSlots = Array.Empty<GameSaveSlotInfo>();
    private string player = OfflinePlayer;
    private string message = ItchCloudConfiguration.IsConfigured
        ? "Playing in this browser. Sign in to enable rankings and cloud saves."
        : "Cloud setup required. Browser saves still work.";

    public CloudAccountStatus AccountStatus => new(ItchCloudConfiguration.IsConfigured, token is not null,
        token is not null && expectedRevision is null, observedSlots.Any(slot => slot.Exists), player, message, observedRevision, deleted);

    private ValueTask<string?> GetItem(string key) => js.InvokeAsync<string?>("localStorage.getItem", key);
    private ValueTask SetItem(string key, string value) => js.InvokeVoidAsync("localStorage.setItem", key, value);
    private ValueTask RemoveItem(string key) => js.InvokeVoidAsync("localStorage.removeItem", key);
    private async Task SetAutoSignIn(bool enabled) => await SetItem(AutoSignInKey, enabled ? "1" : "0");

    private void ClearCloudSession()
    {
        token = null;
        appleSession = false;
        expectedRevision = null;
        observedRevision = null;
        observedSlots = Array.Empty<GameSaveSlotInfo>();
        player = OfflinePlayer;
    }

    private static async Task<bool> IsDeletedSessionAsync(HttpResponseMessage response)
    {
        if (response.StatusCode != HttpStatusCode.Unauthorized) return false;
        try
        {
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            return body.ValueKind == JsonValueKind.Object && body.TryGetProperty("code", out var code)
                && code.ValueKind == JsonValueKind.String && code.GetString() == "AccountDeleted";
        }
        catch (Exception exception) when (exception is JsonException or NotSupportedException) { return false; }
    }

    private static Uri Api(string path) => new(new Uri(ItchCloudConfiguration.ApiBaseUrl.TrimEnd('/') + "/"), path);

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        if (token is null) throw new InvalidOperationException("Sign in first.");
        var request = new HttpRequestMessage(method, Api(path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request)
    {
        var response = await http.SendAsync(request);
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            var wasDeleted = await IsDeletedSessionAsync(response);
            ClearCloudSession();
            await RemoveItem(AppleSessionKey);
            if (wasDeleted) await SetAutoSignIn(false);
            message = wasDeleted
                ? "This session belongs to a deleted game account. Sign in again to start afresh."
                : "Sign-in expired. Your browser saves are unchanged; sign in again.";
        }
        return response;
    }

    // Verifies a bearer with the API, then registers the ranking profile.
    private async Task<bool> ActivateAsync(string candidate, bool apple, bool silent)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, Api("game/account/"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", candidate);
        using var response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            if (apple) await RemoveItem(AppleSessionKey);
            if (!silent) message = await IsDeletedSessionAsync(response)
                ? "Your previous game account was deleted. Sign in again to create a new account."
                : response.StatusCode == HttpStatusCode.Unauthorized
                    ? "Sign-in could not be verified. Please sign in again."
                    : "The sign-in service is unavailable. Retry when connected; your browser saves are unchanged.";
            return false;
        }
        var identity = await response.Content.ReadFromJsonAsync<VerifiedIdentity>();
        if (identity is null || string.IsNullOrWhiteSpace(identity.Subject)) throw new JsonException();
        token = candidate;
        appleSession = apple;
        player = identity.Name;
        await ReadCloudMetadataAsync();
        expectedRevision = observedRevision;
        using var profile = Request(HttpMethod.Post, "game/rankings/profile");
        using var registered = await SendAsync(profile);
        if (!registered.IsSuccessStatusCode)
        {
            if (registered.StatusCode != HttpStatusCode.Unauthorized)
                message = "Sign-in was verified, but account registration failed. Please retry.";
            ClearCloudSession();
            return false;
        }
        deleted = false;
        await SetAutoSignIn(true);
        return true;
    }

    public async Task<CloudAccountStatus> SignInAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (!ItchCloudConfiguration.IsConfigured) return AccountStatus;
            ClearCloudSession();
            restoreAttempted = true;
            var result = await js.InvokeAsync<AuthResult>("pobItchAuth.signInWithGoogle", ItchCloudConfiguration.WebClientId);
            if (result.Token is not { Length: > 0 } candidate)
            {
                message = result.Error == "unavailable"
                    ? "Google sign-in could not load. Allow accounts.google.com and third-party sign-in for this page."
                    : "Sign-in cancelled. Your browser saves are unchanged.";
                return AccountStatus;
            }
            await ActivateAsync(candidate, false, false);
            return AccountStatus;
        }
        catch (Exception)
        {
            ClearCloudSession();
            message = "Sign-in unavailable. Browser progress is safe. Check the connection and retry.";
            return AccountStatus;
        }
        finally { gate.Release(); }
    }

    public async Task<CloudAccountStatus> SignInWithAppleAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (!ItchCloudConfiguration.IsConfigured) return AccountStatus;
            ClearCloudSession();
            restoreAttempted = true;
            var result = await js.InvokeAsync<AuthResult>("pobItchAuth.signInWithApple", ItchCloudConfiguration.ApiBaseUrl, ItchCloudConfiguration.AppleReturnUrl);
            if (result.Token is not { Length: > 0 } session)
            {
                message = result.Error == "blocked"
                    ? "The Apple sign-in window was blocked. Allow pop-ups for this page and try again."
                    : "Sign-in cancelled. Your browser saves are unchanged.";
                return AccountStatus;
            }
            if (await ActivateAsync(session, true, false)) await SetItem(AppleSessionKey, session);
            return AccountStatus;
        }
        catch (Exception)
        {
            ClearCloudSession();
            message = "Apple sign-in unavailable.";
            return AccountStatus;
        }
        finally { gate.Release(); }
    }

    // Restores the previous session on startup: the stored Apple session first, then Google One Tap.
    private async Task RestoreAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (restoreAttempted || !ItchCloudConfiguration.IsConfigured) return;
            restoreAttempted = true;
            if (await GetItem(AutoSignInKey) == "0") return;
            if (await GetItem(AppleSessionKey) is { Length: > 0 } saved && await ActivateAsync(saved, true, true)) return;
            if (await GetItem(AutoSignInKey) != "1") return;
            if (await js.InvokeAsync<string?>("pobItchAuth.trySilentGoogle", ItchCloudConfiguration.WebClientId) is { Length: > 0 } google)
                await ActivateAsync(google, false, true);
        }
        catch (Exception exception) when (IsRecoverable(exception)) { ClearCloudSession(); }
        finally { gate.Release(); }
    }

    public async Task<CloudAccountStatus> SignOutAsync()
    {
        await gate.WaitAsync();
        try
        {
            ClearCloudSession();
            restoreAttempted = true;
            await SetAutoSignIn(false);
            await RemoveItem(AppleSessionKey);
            try { await js.InvokeVoidAsync("pobItchAuth.signOutGoogle"); } catch (JSException) { }
            message = "Signed out. Browser saves remain; no further cloud requests are authorized.";
            return AccountStatus;
        }
        finally { gate.Release(); }
    }

    public async Task<CloudAccountStatus> RefreshCloudAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (token is not null) await ReadCloudMetadataAsync();
            return AccountStatus;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        {
            message = "Could not read cloud metadata. No save was changed. Retry when connected.";
            return AccountStatus;
        }
        finally { gate.Release(); }
    }

    public async Task<CloudAccountStatus> ChangeDisplayNameAsync(string name)
    {
        await gate.WaitAsync();
        try
        {
            if (token is null) { message = "Sign in before changing your player name."; return AccountStatus; }
            if (!PlayerDisplayNameRules.TryNormalize(name, out var normalized))
            { message = PlayerDisplayNameRules.Guidance; return AccountStatus; }
            using var request = Request(HttpMethod.Put, "game/account/display-name");
            request.Content = JsonContent.Create(new { name = normalized });
            using var response = await SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode == HttpStatusCode.Conflict)
                    message = "That player name is already taken. Choose another nickname.";
                else if (response.StatusCode != HttpStatusCode.Unauthorized)
                    message = "Player name was not changed. Check the connection and retry.";
                return AccountStatus;
            }
            var receipt = await response.Content.ReadFromJsonAsync<DisplayNameReceipt>();
            if (receipt is null || !PlayerDisplayNameRules.TryNormalize(receipt.Name, out var verified)) throw new JsonException();
            player = verified;
            message = $"Player name updated to {player}. Your saves and scores are unchanged.";
            return AccountStatus;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { message = "Could not confirm the player name change. Sign in again to check; browser progress is safe."; return AccountStatus; }
        finally { gate.Release(); }
    }

    private async Task ReadCloudMetadataAsync()
    {
        using var request = Request(HttpMethod.Get, "game/saves");
        using var response = await SendAsync(request);
        response.EnsureSuccessStatusCode();
        var metadata = await response.Content.ReadFromJsonAsync<JsonElement>();
        if (!metadata.TryGetProperty("revision", out var revision) || !revision.TryGetInt64(out var value) || value < 0
            || !metadata.TryGetProperty("slots", out var slots) || slots.ValueKind != JsonValueKind.Array)
            throw new JsonException();
        observedRevision = value;
        observedSlots = JsonSerializer.Deserialize<GameSaveSlotInfo[]>(slots.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new JsonException();
        // Refreshing metadata must not advance the write baseline, or a stale tab could overwrite remote changes.
        message = observedSlots.Any(slot => slot.Exists) ? "Cloud save slots available. Choose a slot to load or save."
            : "No cloud saves yet. Save a run to create one.";
    }

    public async Task<IReadOnlyList<GameSaveSlotInfo>> GetSaveSlotsAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (token is null) return await local.GetSaveSlotsAsync();
            await ReadCloudMetadataAsync();
            return observedSlots;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        {
            message = "Could not read cloud save slots. Showing browser saves.";
            return await local.GetSaveSlotsAsync();
        }
        finally { gate.Release(); }
    }

    public async Task<GameSaveResult> ResolveCloudSaveAsync(bool useCloud)
    {
        await gate.WaitAsync();
        try
        {
            if (token is null || observedRevision is null) return new(false, "Sign in and refresh cloud metadata first.");
            if (useCloud)
            {
                var cloudSlots = observedSlots.Where(slot => slot.Exists).ToArray();
                if (cloudSlots.Length == 0) return new(false, "This account has no cloud saves. Upload a browser save instead.");
                await local.BackupAsync();
                foreach (var cloudSlot in cloudSlots)
                {
                    using var request = Request(HttpMethod.Get, $"game/save?slot={cloudSlot.Slot}");
                    using var response = await SendAsync(request);
                    if (!response.IsSuccessStatusCode) return new(false, "Could not copy every cloud slot. The previous browser saves are backed up.");
                    var save = (await response.Content.ReadFromJsonAsync<JsonElement>()).Clone();
                    var stored = await local.SaveAsync(save, cloudSlot.Slot);
                    if (!stored.Success) return stored;
                }
                expectedRevision = observedRevision;
                message = $"Copied {cloudSlots.Length} cloud save{(cloudSlots.Length == 1 ? "" : "s")} to this browser; previous saves backed up.";
                return new(true, message);
            }
            var browserSlots = (await local.GetSaveSlotsAsync()).Where(slot => slot.Exists).ToArray();
            if (browserSlots.Length == 0) return new(false, "This browser has no saved runs to upload.");
            var revision = observedRevision.Value;
            foreach (var browserSlot in browserSlots)
            {
                var saved = await local.LoadAsync(browserSlot.Slot);
                if (!saved.Success || saved.Save is not { } snapshot) return saved;
                var uploaded = await UploadAsync(snapshot, revision, browserSlot.Slot);
                if (!uploaded.Success) return uploaded;
                revision = observedRevision ?? revision;
            }
            message = $"Uploaded {browserSlots.Length} browser save{(browserSlots.Length == 1 ? "" : "s")} to the cloud.";
            return new(true, message);
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { return new(false, message = "Cloud choice failed. Your browser saves are unchanged; retry when connected."); }
        finally { gate.Release(); }
    }

    public async Task<string?> SaveProfileAsync(string json)
    {
        if (System.Text.Encoding.UTF8.GetByteCount(json) > 8 * 1024) return null;
        await gate.WaitAsync();
        try
        {
            if (token is null) return null;
            using var request = Request(HttpMethod.Put, "game/profile");
            request.Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            using var response = await SendAsync(request);
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
            if (token is null) return null;
            using var request = Request(HttpMethod.Get, "game/profile");
            using var response = await SendAsync(request);
            return response.IsSuccessStatusCode ? await response.Content.ReadAsStringAsync() : null;
        }
        catch (Exception exception) when (IsRecoverable(exception)) { return null; }
        finally { gate.Release(); }
    }

    public async Task<GameSaveResult> SaveAsync(JsonElement snapshot, int slot)
    {
        if (slot is < 1 or > 5) return new(false, "Choose a valid save slot.");
        await gate.WaitAsync();
        try
        {
            var result = await local.SaveAsync(snapshot, slot);
            if (!result.Success) return result;
            if (token is null) return result with { Message = "Saved in this browser. Sign in for cloud sync." };
            if (expectedRevision is null) return result with { Success = false, Message = "Saved in this browser, but cloud sync is paused. Open Options > Account to choose which save to keep." };
            try
            {
                var synced = await UploadAsync(snapshot, expectedRevision.Value, slot);
                return result with { Success = synced.Success, Message = synced.Success ? "Saved in this browser and synced to cloud." : "Saved in this browser. " + synced.Message };
            }
            catch (Exception exception) when (IsRecoverable(exception))
            { return result with { Success = false, Message = "Saved in this browser; cloud sync unavailable. Retry Save when connected." }; }
        }
        finally { gate.Release(); }
    }

    private async Task<GameSaveResult> UploadAsync(JsonElement snapshot, long revision, int slot)
    {
        using var request = Request(HttpMethod.Put, $"game/save?slot={slot}");
        request.Headers.IfMatch.Add(new EntityTagHeaderValue($"\"{revision}\""));
        request.Content = JsonContent.Create(snapshot);
        using var response = await SendAsync(request);
        if (response.StatusCode == HttpStatusCode.Conflict)
        {
            expectedRevision = null;
            observedRevision = null;
            observedSlots = Array.Empty<GameSaveSlotInfo>();
            return new(false, "Cloud conflict: another device changed the save. Open Options > Account, refresh, then choose a save. Nothing was overwritten.");
        }
        if (!response.IsSuccessStatusCode)
            return new(false, response.StatusCode == HttpStatusCode.Unauthorized ? message : "Cloud rejected the save. Browser progress is safe.");
        var receipt = await response.Content.ReadFromJsonAsync<SaveReceipt>();
        if (receipt is null || receipt.Revision <= revision) throw new JsonException();
        expectedRevision = observedRevision = receipt.Revision;
        observedSlots = Enumerable.Range(1, 5).Select(number =>
        {
            var previous = observedSlots.FirstOrDefault(info => info.Slot == number) ?? new GameSaveSlotInfo(number, false);
            return number == slot ? previous with
            {
                Exists = true,
                SavedAt = receipt.SavedAt ?? DateTimeOffset.UtcNow,
                EndlessUnlocked = receipt.EndlessUnlocked,
                Revision = receipt.Revision
            } : previous;
        }).ToArray();
        return new(true, "Browser save uploaded.", EndlessUnlocked: receipt.EndlessUnlocked);
    }

    public async Task<GameSaveResult> LoadAsync(int slot)
    {
        if (slot is < 1 or > 5) return new(false, "Choose a valid save slot.");
        await gate.WaitAsync();
        try
        {
            if (token is null) return await local.LoadAsync(slot);
            await ReadCloudMetadataAsync();
            if (!observedSlots.Any(saved => saved.Slot == slot && saved.Exists)) return new(false, $"Slot {slot} has no cloud save.");
            using var request = Request(HttpMethod.Get, $"game/save?slot={slot}");
            using var response = await SendAsync(request);
            if (response.StatusCode == HttpStatusCode.NotFound) return new(false, $"Slot {slot} has no cloud save.");
            response.EnsureSuccessStatusCode();
            var save = (await response.Content.ReadFromJsonAsync<JsonElement>()).Clone();
            await local.BackupAsync();
            var stored = await local.SaveAsync(save, slot);
            if (!stored.Success) return stored;
            expectedRevision = observedRevision;
            var loaded = await local.LoadAsync(slot);
            return loaded with { Message = "Loaded from cloud. Previous browser save backed up." };
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { return new(false, "Cloud load unavailable. Your current run and browser saves are unchanged."); }
        finally { gate.Release(); }
    }

    public async Task<string> GetPlayerNameAsync()
    {
        if (!restoreAttempted) await RestoreAsync();
        return player;
    }

    public Task<bool> RegisterPlayerAsync() => RankingRequestAsync(HttpMethod.Post, "game/rankings/profile");
    public async Task<bool> SubmitScoreAsync(ScoreSubmission submission) =>
        RankingRules.IsValid(submission) && await RankingRequestAsync(HttpMethod.Put, "game/rankings/", submission);

    private async Task<bool> RankingRequestAsync(HttpMethod method, string path, ScoreSubmission? score = null)
    {
        await gate.WaitAsync();
        try
        {
            if (token is null) return false;
            using var request = Request(method, path);
            if (score is not null) request.Content = JsonContent.Create(score);
            using var response = await SendAsync(request);
            return response.IsSuccessStatusCode;
        }
        catch (Exception exception) when (IsRecoverable(exception)) { return false; }
        finally { gate.Release(); }
    }

    public async Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch)
    {
        await gate.WaitAsync();
        try
        {
            if (token is null) return null;
            using var request = Request(HttpMethod.Get, $"game/rankings/?difficulty={Uri.EscapeDataString(difficulty)}&mode={Uri.EscapeDataString(mode)}&heroClass={Uri.EscapeDataString(heroClass)}&patch={Uri.EscapeDataString(patch)}");
            using var response = await SendAsync(request);
            return response.IsSuccessStatusCode ? await response.Content.ReadFromJsonAsync<List<RankingRow>>() : null;
        }
        catch (Exception exception) when (IsRecoverable(exception)) { return null; }
        finally { gate.Release(); }
    }

    public async Task<CloudAccountStatus> DeleteAccountAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (token is null) { message = "Sign in to delete the verified account."; return AccountStatus; }
            using var request = Request(HttpMethod.Delete, "game/account/");
            using var response = await SendAsync(request);
            if (response.StatusCode != HttpStatusCode.NoContent) { message = "Account deletion was not confirmed. Retry; browser saves were not deleted."; return AccountStatus; }
            deleted = true;
            ClearCloudSession();
            restoreAttempted = true;
            await SetAutoSignIn(false);
            await RemoveItem(AppleSessionKey);
            try { await js.InvokeVoidAsync("pobItchAuth.signOutGoogle"); } catch (JSException) { }
            try { await local.ClearAsync(); message = "Game account deleted. Sign in to create a new account, or start a new run."; }
            catch (JSException) { message = "Cloud data deleted. Clearing browser storage failed; clear site data before playing again."; }
            return AccountStatus;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        {
            message = "Deletion could not be confirmed. Retry when connected; browser progress was retained.";
            return AccountStatus;
        }
        finally { gate.Release(); }
    }

    private static bool IsRecoverable(Exception exception) => exception is HttpRequestException or TaskCanceledException
        or TimeoutException or JsonException or InvalidOperationException or NotSupportedException or JSException;

    private sealed record AuthResult(string? Token, string? Error, long Expires = 0);
    private sealed record VerifiedIdentity(string Subject, string Name);
    private sealed record DisplayNameReceipt(string Name);
    private sealed record SaveReceipt(long Revision, bool EndlessUnlocked, DateTimeOffset? SavedAt = null);
}

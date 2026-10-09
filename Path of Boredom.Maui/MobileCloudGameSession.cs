using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Path_of_Boredom.Game;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.Maui;

/// <summary>Local-first saves, verified Google accounts and optimistic-revision cloud sync.</summary>
public sealed class MobileCloudGameSession(OfflineGameSession local) : IGameSession, ICloudGameSession
{
    private const string AutoSignInPreference = "cloud.auto-sign-in";
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly HttpClient http = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(20)
    };
    internal MobileCloudGameSession(OfflineGameSession local, HttpClient cloudClient) : this(local)
    {
        ArgumentNullException.ThrowIfNull(cloudClient);
        http.Dispose();
        http = cloudClient;
    }
    private string? token;
    private bool restoreAttempted;
    private long? expectedRevision;
    private JsonElement? observedSave;
    private long? observedRevision;
    private string player = "Offline player";
    private bool deleted;
    private string message = GoogleSignInConfiguration.IsConfigured
        ? "Offline play. Sign in to enable rankings and choose a cloud save."
        : "Cloud setup required: configure the Cloud Run HTTPS URL and Web OAuth client ID. Offline saves work.";

    public CloudAccountStatus AccountStatus => new(GoogleSignInConfiguration.IsConfigured, token is not null,
        token is not null && expectedRevision is null, observedSave is not null, player, message, observedRevision, deleted);

    // Tokens stay in memory; only the user's permission to restore a native session is persisted.
    private void ClearCloudSession()
    {
        token = null;
        expectedRevision = null;
        observedRevision = null;
        observedSave = null;
        player = "Offline player";
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

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        if (token is null || !GoogleSignInConfiguration.IsConfigured) throw new InvalidOperationException("Sign in first.");
        var request = new HttpRequestMessage(method, new Uri(new Uri(GoogleSignInConfiguration.ApiBaseUrl.TrimEnd('/') + "/"), path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request)
    {
        var response = await http.SendAsync(request);
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            ClearCloudSession();
            Preferences.Set(AutoSignInPreference, false);
            message = await IsDeletedSessionAsync(response)
                ? "This session belongs to a deleted game account. Continue with Google to sign in afresh."
                : "Sign-in expired. Your device save is unchanged; continue with Google again.";
        }
        return response;
    }

    public Task<CloudAccountStatus> SignInAsync() => SignInAsync(false);

    private async Task<CloudAccountStatus> SignInAsync(bool silent)
    {
        await gate.WaitAsync();
        try
        {
            if (!GoogleSignInConfiguration.IsConfigured) return AccountStatus;
            ClearCloudSession();
            restoreAttempted = true;
            var candidate = silent ? await NativeGoogleSignIn.TrySilentSignInAsync(GoogleSignInConfiguration.WebClientId)
                : await NativeGoogleSignIn.SignInAsync(GoogleSignInConfiguration.WebClientId);
            for (var attempt = 0; attempt < 2; attempt++)
            {
                if (candidate is null) { if (!silent) message = "Sign-in cancelled. Your device save is unchanged."; return AccountStatus; }
                using var request = new HttpRequestMessage(HttpMethod.Get,
                    GoogleSignInConfiguration.ApiBaseUrl.TrimEnd('/') + "/game/account/");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", candidate);
                using var response = await http.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    if (await IsDeletedSessionAsync(response))
                    {
                        Preferences.Set(AutoSignInPreference, false);
                        if (!silent && attempt == 0)
                        {
                            await NativeGoogleSignIn.RevokeAccessAsync();
                            candidate = await NativeGoogleSignIn.SignInAsync(GoogleSignInConfiguration.WebClientId);
                            continue;
                        }
                        message = "Your previous game account was deleted. Continue with Google to create a new account with a fresh session.";
                    }
                    else message = response.StatusCode == HttpStatusCode.Unauthorized
                        ? "Google sign-in could not be verified. Continue with Google again to refresh your session."
                        : "The sign-in service is unavailable. Retry when connected; your device save is unchanged.";
                    return AccountStatus;
                }
                var identity = await response.Content.ReadFromJsonAsync<VerifiedIdentity>();
                if (identity is null || string.IsNullOrWhiteSpace(identity.Subject)) throw new JsonException();
                // Identity comes exclusively from the server's verified sub, never from caller headers.
                token = candidate;
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
                    return AccountStatus;
                }
                deleted = false;
                Preferences.Set(AutoSignInPreference, true);
                return AccountStatus;
            }
            return AccountStatus;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        {
            ClearCloudSession();
            message = "Sign-in/cloud lookup unavailable. Device progress is safe. Check the connection and Google registration.";
            return AccountStatus;
        }
        finally { gate.Release(); }
    }

    public async Task<CloudAccountStatus> SignOutAsync()
    {
        await gate.WaitAsync();
        try
        {
            ClearCloudSession();
            restoreAttempted = true;
            Preferences.Set(AutoSignInPreference, false);
            message = "Signed out. Device progress remains; no further cloud requests are authorized.";
            await NativeGoogleSignIn.SignOutAsync();
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
                    message = "Player name was not changed. Check the connection and that the latest backend is deployed.";
                return AccountStatus;
            }
            var receipt = await response.Content.ReadFromJsonAsync<DisplayNameReceipt>();
            if (receipt is null || !PlayerDisplayNameRules.TryNormalize(receipt.Name, out var verified)) throw new JsonException();
            player = verified;
            message = $"Player name updated to {player}. Your saves and scores are unchanged.";
            return AccountStatus;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { message = "Could not confirm the player name change. Sign in again to check; device progress is safe."; return AccountStatus; }
        finally { gate.Release(); }
    }

    private async Task ReadCloudMetadataAsync()
    {
        using var request = Request(HttpMethod.Get, "game/save");
        using var response = await SendAsync(request);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            observedRevision = 0;
            observedSave = null;
        }
        else
        {
            response.EnsureSuccessStatusCode();
            var save = await response.Content.ReadFromJsonAsync<JsonElement>();
            if (!save.TryGetProperty("revision", out var revision) || !revision.TryGetInt64(out var value) || value < 1
                || !save.TryGetProperty("state", out var state) || state.ValueKind != JsonValueKind.Object)
                throw new JsonException();
            observedRevision = value;
            observedSave = save.Clone();
        }
        // Refreshing display metadata MUST NOT advance the write baseline. Otherwise a stale
        // device could silently overwrite a remote change without seeing a conflict.
        message = observedSave is null ? "No cloud save yet. Save a run to create one."
            : "Cloud save available. Load to continue it, or Save to upload your current run.";
    }

    public async Task<GameSaveResult> ResolveCloudSaveAsync(bool useCloud)
    {
        await gate.WaitAsync();
        try
        {
            if (token is null || observedRevision is null) return new(false, "Sign in and refresh cloud metadata first.");
            if (useCloud)
            {
                if (observedSave is not { } save) return new(false, "This account has no cloud save. Upload a device save instead.");
                await local.BackupAsync();
                var result = await local.SaveAsync(save);
                if (!result.Success) return result;
                expectedRevision = observedRevision;
                message = "Cloud save copied to this device; previous local save backed up. Choose Load saved run to play it.";
                return result with { Message = message };
            }
            var device = await local.LoadAsync();
            if (!device.Success || device.Save is not { } snapshot) return device;
            // Use exactly the revision displayed when the player confirmed, not a fresh read.
            var uploaded = await UploadAsync(snapshot, observedRevision.Value);
            message = uploaded.Message;
            return uploaded;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        {
            return new(false, message = "Cloud choice failed. Your previous device save is unchanged; retry when connected.");
        }
        finally { gate.Release(); }
    }

    public async Task<GameSaveResult> SaveAsync(JsonElement snapshot)
    {
        await gate.WaitAsync();
        try
        {
            var result = await local.SaveAsync(snapshot);
            if (!result.Success) return result;
            if (token is null) return result with { Message = "Saved on this device. Sign in for cloud sync." };
            if (expectedRevision is null) return result with { Success = false, Message = "Saved on this device, but cloud sync is paused. Open Account & cloud to choose which save to keep before syncing." };
            try
            {
                var synced = await UploadAsync(snapshot, expectedRevision.Value);
                return result with { Success = synced.Success, Message = synced.Success ? "Saved on this device and synced to cloud." : "Saved on this device. " + synced.Message };
            }
            catch (Exception exception) when (IsRecoverable(exception))
            {
                return result with { Success = false, Message = "Saved on this device; cloud sync unavailable. Retry Save when connected." };
            }
        }
        finally { gate.Release(); }
    }

    private async Task<GameSaveResult> UploadAsync(JsonElement snapshot, long revision)
    {
        using var request = Request(HttpMethod.Put, "game/save");
        request.Headers.IfMatch.Add(new EntityTagHeaderValue($"\"{revision}\""));
        request.Content = JsonContent.Create(snapshot);
        using var response = await SendAsync(request);
        if (response.StatusCode == HttpStatusCode.Conflict)
        {
            expectedRevision = null;
            observedRevision = null;
            observedSave = null;
            return new(false, "Cloud conflict: another device changed the save. Open Account & cloud, refresh, then explicitly choose a save. Neither cloud save nor device progress was overwritten.");
        }
        if (!response.IsSuccessStatusCode)
        {
            if (response.StatusCode == HttpStatusCode.BadRequest)
            {
                var error = await response.Content.ReadFromJsonAsync<JsonElement>();
                if (error.ValueKind == JsonValueKind.Object && error.TryGetProperty("code", out var code)
                    && code.ValueKind == JsonValueKind.String && code.GetString() == "UnsupportedSaveVersion")
                    return new(false, "The API needs the latest save-format update. Your device checkpoint is safe; deploy the updated backend, then retry Save.");
            }
            return new(false, response.StatusCode == HttpStatusCode.Unauthorized ? message : "Cloud rejected the save. Device progress is safe; check sign-in and server compatibility.");
        }
        var receipt = await response.Content.ReadFromJsonAsync<SaveReceipt>();
        if (receipt is null || receipt.Revision <= revision) throw new JsonException();
        expectedRevision = observedRevision = receipt.Revision;
        // Refresh the display copy without changing its bounded state.
        observedSave = JsonSerializer.SerializeToElement(new
        {
            version = snapshot.GetProperty("version"), state = snapshot.GetProperty("state"),
            endlessUnlocked = receipt.EndlessUnlocked, revision = receipt.Revision
        });
        return new(true, "Device save uploaded. Future saves sync until sign-out, expiry or a revision conflict.", EndlessUnlocked: receipt.EndlessUnlocked);
    }

    public async Task<GameSaveResult> LoadAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (token is null) return await local.LoadAsync();
            await ReadCloudMetadataAsync();
            if (observedSave is not { } save) return new(false, "No cloud save available. Start a run and Save to create one.");
            await local.BackupAsync();
            var stored = await local.SaveAsync(save);
            if (!stored.Success) return stored;
            expectedRevision = observedRevision;
            var loaded = await local.LoadAsync();
            return loaded with { Message = "Loaded from cloud. Previous device save backed up." };
        }
        catch (Exception exception) when (IsRecoverable(exception))
        { return new(false, "Cloud load unavailable. Your current run and device save are unchanged; retry when connected."); }
        finally { gate.Release(); }
    }

    public async Task<string> GetPlayerNameAsync()
    {
        if (!restoreAttempted && Preferences.Get(AutoSignInPreference, true)) await SignInAsync(true);
        return player;
    }

    public async Task<bool> RegisterPlayerAsync() => await RankingRequestAsync(HttpMethod.Post, "game/rankings/profile");
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
            if (response.StatusCode != HttpStatusCode.NoContent) { message = "Account deletion was not confirmed. Retry; local files were not deleted."; return AccountStatus; }
            deleted = true;
            ClearCloudSession();
            restoreAttempted = true;
            Preferences.Set(AutoSignInPreference, false);
            // Server deletion is already committed; report a local-cleanup error separately.
            try { await local.ClearAsync(); message = "Game account deleted. Continue with Google to create a new account, or start a new offline run."; }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            { message = "Cloud data deleted. Device cleanup failed; clear app storage before playing again."; }
            try { await NativeGoogleSignIn.RevokeAccessAsync(); }
            catch (Exception)
            { message += " Google cleanup could not finish; continue with Google again to refresh the session."; }
            return AccountStatus;
        }
        catch (Exception exception) when (IsRecoverable(exception))
        {
            message = "Deletion could not be confirmed. Retry when connected; local progress was retained.";
            return AccountStatus;
        }
        finally { gate.Release(); }
    }

    private static bool IsRecoverable(Exception exception) => exception is HttpRequestException or TaskCanceledException
        or TimeoutException or JsonException or IOException or UnauthorizedAccessException or InvalidOperationException or NotSupportedException;
    private sealed record VerifiedIdentity(string Subject, string Name);
    private sealed record DisplayNameReceipt(string Name);
    private sealed record SaveReceipt(long Revision, bool EndlessUnlocked);
}

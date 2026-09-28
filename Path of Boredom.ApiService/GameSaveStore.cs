using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Path_of_Boredom.ApiService;

/// <summary>
/// Owns reading and writing player save files on disk. Storage is deliberately simple: one JSON
/// file per player, named by a hash of their owner id, in a single "windows" subfolder. There's no
/// database here — this was a reasonable choice for a small self-hosted game, but it does mean
/// this class has to do its own concurrency control (the <see cref="gate"/>) and its own crash-safety
/// (write-to-temp-then-rename) by hand, since there's no transactional storage engine doing it for us.
/// </summary>
public sealed class GameSaveStore(IWebHostEnvironment environment, IConfiguration configuration, ILogger<GameSaveStore> logger)
{
    /// <summary>
    /// Root folder saves are written under. Configurable via "Saves:Directory"; defaults to
    /// App_Data/saves under the app's content root, which for the IIS deployment means it lives
    /// alongside the deployed app files — worth remembering that a fresh deploy that wipes the app
    /// folder wipes saves too unless this is pointed somewhere persistent outside the deployment path.
    /// </summary>
    private readonly string directory = Path.GetFullPath(configuration["Saves:Directory"]
        ?? Path.Combine(environment.ContentRootPath, "App_Data", "saves"));

    /// <summary>
    /// A single process-wide semaphore serializing every save read/write, regardless of which
    /// player it's for. This is intentionally coarse — simpler to reason about than per-player
    /// locks, and save/load calls are infrequent enough (manual saves, checkpoints) that contention
    /// isn't a real performance concern here.
    /// </summary>
    private readonly SemaphoreSlim gate = new(1, 1);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Reads a player's stored save, if one exists. Returns null if there's no file yet (a brand
    /// new player) — a genuinely unreadable/corrupt file is a different case and throws a
    /// <see cref="JsonException"/> instead, which GameSaveEndpoints.cs translates into a
    /// "CorruptStoredSave" API error rather than silently treating it as "no save".
    /// </summary>
    public async Task<GameSave?> LoadAsync(string ownerId, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var path = GetPath(ownerId);
            if (!File.Exists(path)) return null;

            try
            {
                await using var stream = File.OpenRead(path);
                return await JsonSerializer.DeserializeAsync<GameSave>(stream, JsonOptions, cancellationToken)
                    ?? throw new JsonException("The stored save is null.");
            }
            catch (JsonException exception)
            {
                // Deliberately don't touch the file here — a load should never destroy data, even
                // damaged data, in case a future fix or manual recovery could still read it.
                logger.LogError(exception, "Stored save {SavePath} is unreadable. The file has not been changed.", path);
                throw;
            }
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>
    /// Persists a new save for a player, replacing whatever was stored before. This is the one
    /// place recovery from a corrupt stored file actually happens: unlike <see cref="LoadAsync"/>,
    /// a save operation is allowed to overwrite a damaged file — but only after backing the damaged
    /// bytes up to a sibling ".corrupt" file first, so nothing is silently destroyed.
    /// </summary>
    /// <param name="ownerId">The stable per-player key (SID-based, or name-based as a fallback) used to compute the file path.</param>
    /// <param name="windowsUser">The display username, stored alongside the save purely for admin/debugging convenience (it's not used to look the save back up).</param>
    /// <param name="state">The raw save payload as sent by the client.</param>
    /// <param name="version">The save format version the client is writing.</param>
    public async Task<GameSave> SaveAsync(string ownerId, string windowsUser, JsonElement state, int version, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        string? temporaryPath = null;
        try
        {
            var accountDirectory = Path.Combine(directory, "windows");
            Directory.CreateDirectory(accountDirectory);
            var path = GetPath(ownerId);
            GameSave? previous = null;
            var recoveredFromCorruptSave = false;
            if (File.Exists(path))
            {
                try
                {
                    await using var existing = File.OpenRead(path);
                    previous = await JsonSerializer.DeserializeAsync<GameSave>(existing, JsonOptions, cancellationToken)
                        ?? throw new JsonException("The stored save is null.");
                }
                catch (JsonException exception)
                {
                    // The existing file on disk can't be parsed — back it up with a timestamped,
                    // GUID-suffixed ".corrupt" name (so repeated failures never collide/overwrite
                    // each other) before we let the new save below replace the original path.
                    // This is what GameSaveClient.cs's "recoveredFromCorruptSave" message refers to.
                    var backupPath = $"{path}.{DateTimeOffset.UtcNow:yyyyMMddTHHmmssfffZ}.{Guid.NewGuid():N}.corrupt";
                    File.Copy(path, backupPath, overwrite: false);
                    recoveredFromCorruptSave = true;
                    logger.LogWarning(exception, "Unreadable save {SavePath} was backed up to {BackupPath} before replacement. Only the submitted run's progress and unlocks can be retained.", path, backupPath);
                }
            }

            // Endless mode unlock is sticky for a given player: once true, it stays true even if a
            // later save (e.g. starting a fresh campaign run) wouldn't otherwise satisfy the
            // "campaign complete" check on its own. This also has to check the *previous* stored
            // save's state, not just the incoming one, since a player might save mid-way through a
            // subsequent playthrough after already unlocking Endless once before.
            var unlocked = previous?.EndlessUnlocked == true
                || (previous is not null && HasCompletedCampaign(previous.State))
                || HasCompletedCampaign(state);
            var save = new GameSave(version, DateTimeOffset.UtcNow, state.Clone(), unlocked, windowsUser)
            {
                RecoveredFromCorruptSave = recoveredFromCorruptSave
            };
            // Write-to-temp-then-rename: never write directly over the real save file. If the
            // process crashes or the disk fills up mid-write, the original file (or nothing, on a
            // brand new save) is left intact rather than a half-written, corrupted JSON file.
            // FileShare.None + CreateNew also guards against two concurrent writers racing on the
            // same temp name (astronomically unlikely given the GUID, but free to guard against).
            temporaryPath = Path.Combine(accountDirectory, $"{Guid.NewGuid():N}.tmp");
            await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await JsonSerializer.SerializeAsync(stream, save, JsonOptions, cancellationToken);
                await stream.FlushAsync(cancellationToken);
                // Forces the OS to actually flush to physical disk rather than just to the OS cache,
                // so a power loss right after this point still leaves the temp file durable on disk
                // before the rename below makes it the new save-of-record.
                stream.Flush(flushToDisk: true);
            }

            // Atomic (on the same volume) rename over the real path — this is the actual moment the
            // new save becomes "the" save; nothing before this line has modified the real file.
            File.Move(temporaryPath, path, overwrite: true);
            return save;
        }
        finally
        {
            try
            {
                // Clean up the temp file if something above threw before the rename happened —
                // otherwise stray .tmp files would accumulate in the saves folder over time.
                if (temporaryPath is not null && File.Exists(temporaryPath)) File.Delete(temporaryPath);
            }
            finally
            {
                gate.Release();
            }
        }
    }

    /// <summary>
    /// Computes the on-disk file path for a given owner id. The id is SHA-256 hashed rather than
    /// used as a raw file name both to avoid any filesystem-unsafe-character concerns and so a
    /// save file's name doesn't visibly reveal a player's Windows SID/username just by looking at
    /// the saves folder.
    /// </summary>
    private string GetPath(string ownerId)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(ownerId)));
        return Path.Combine(directory, "windows", $"{hash}.json");
    }

    /// <summary>
    /// Reads the "campaignComplete" flag out of a raw save state without needing to know its full
    /// shape — deliberately defensive (checks ValueKind at every step) since this is called on
    /// both freshly-submitted, already-validated state and on a previously-stored save that could
    /// theoretically be from an older/different save format.
    /// </summary>
    private static bool HasCompletedCampaign(JsonElement state) => state.ValueKind == JsonValueKind.Object
        && state.TryGetProperty("campaignComplete", out var completed)
        && completed.ValueKind == JsonValueKind.Number && completed.TryGetInt32(out var value) && value == 1;
}

/// <summary>
/// The on-disk (and API response) shape of a stored save. Note this wraps the actual game state as
/// an opaque <see cref="JsonElement"/> rather than a strongly-typed model — the API never needs to
/// understand individual save fields, it only needs to store/retrieve them and check a couple of
/// specific properties (see <see cref="GameSaveStore.HasCompletedCampaign"/> and the version-specific
/// validation in GameSaveEndpoints.cs).
/// </summary>
/// <param name="Version">The save format version this state was written in.</param>
/// <param name="SavedAt">When this save was written, server-side.</param>
/// <param name="State">The actual game state blob, exactly as submitted by the client.</param>
/// <param name="EndlessUnlocked">Whether this player has permanently unlocked Endless mode (sticky once true — see <see cref="GameSaveStore.SaveAsync"/>).</param>
/// <param name="WindowsUser">The display username at the time of this save, kept for admin/debugging convenience only.</param>
public sealed record GameSave(int Version, DateTimeOffset SavedAt, JsonElement State, bool EndlessUnlocked = false, string? WindowsUser = null)
{
    /// <summary>
    /// True if this particular save operation replaced a stored file that couldn't be parsed
    /// (see <see cref="GameSaveStore.SaveAsync"/>'s backup-then-replace logic). Marked
    /// <see cref="JsonIgnoreAttribute"/> because this is a transient, in-request-only flag — it
    /// shouldn't itself be persisted as part of the save file, only relayed back to the caller once
    /// via the API response.
    /// </summary>
    [JsonIgnore]
    public bool RecoveredFromCorruptSave { get; init; }
}

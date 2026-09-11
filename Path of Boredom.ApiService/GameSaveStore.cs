using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Path_of_Boredom.ApiService;

public sealed class GameSaveStore(IWebHostEnvironment environment, IConfiguration configuration)
{
    private readonly string directory = Path.GetFullPath(configuration["Saves:Directory"]
        ?? Path.Combine(environment.ContentRootPath, "App_Data", "saves"));
    private readonly SemaphoreSlim gate = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<GameSave?> LoadAsync(string ownerId, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var path = GetPath(ownerId);
            if (!File.Exists(path))
            {
                return null;
            }

            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<GameSave>(stream, JsonOptions, cancellationToken);
        }
        finally
        {
            gate.Release();
        }
    }

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
            if (File.Exists(path))
            {
                await using var existing = File.OpenRead(path);
                previous = await JsonSerializer.DeserializeAsync<GameSave>(existing, JsonOptions, cancellationToken);
            }

            var unlocked = previous?.EndlessUnlocked == true
                || (previous is not null && HasCompletedCampaign(previous.State))
                || HasCompletedCampaign(state);
            var save = new GameSave(version, DateTimeOffset.UtcNow, state.Clone(), unlocked, windowsUser);
            temporaryPath = Path.Combine(accountDirectory, $"{Guid.NewGuid():N}.tmp");
            await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await JsonSerializer.SerializeAsync(stream, save, JsonOptions, cancellationToken);
                await stream.FlushAsync(cancellationToken);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporaryPath, path, overwrite: true);
            return save;
        }
        finally
        {
            try
            {
                if (temporaryPath is not null && File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
            finally
            {
                gate.Release();
            }
        }
    }

    private string GetPath(string ownerId)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(ownerId)));
        return Path.Combine(directory, "windows", $"{hash}.json");
    }

    private static bool HasCompletedCampaign(JsonElement state) => state.ValueKind == JsonValueKind.Object
        && state.TryGetProperty("campaignComplete", out var completed)
        && completed.ValueKind == JsonValueKind.Number && completed.TryGetInt32(out var value) && value == 1;
}

public sealed record GameSave(int Version, DateTimeOffset SavedAt, JsonElement State, bool EndlessUnlocked = false, string? WindowsUser = null);

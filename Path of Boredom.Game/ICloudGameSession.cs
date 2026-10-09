using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.Game;

/// <summary>Optional host capability; desktop/offline hosts need not implement cloud accounts.</summary>
public interface ICloudGameSession
{
    CloudAccountStatus AccountStatus { get; }
    Task<CloudAccountStatus> SignInAsync();
    Task<CloudAccountStatus> SignOutAsync();
    Task<CloudAccountStatus> RefreshCloudAsync();
    Task<CloudAccountStatus> ChangeDisplayNameAsync(string name);
    Task<GameSaveResult> ResolveCloudSaveAsync(bool useCloud);
    Task<CloudAccountStatus> DeleteAccountAsync();
}

public sealed record CloudAccountStatus(bool Configured, bool SignedIn, bool NeedsSaveChoice,
    bool CloudSaveExists, string Player, string Message, long? CloudRevision = null, bool Deleted = false);

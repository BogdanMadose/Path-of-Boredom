using Android.Gms.Games;
using Path_of_Boredom.Game;

namespace Path_of_Boredom.Maui
{
    public sealed class NativePlayGamesAchievements : IGameAchievementService
    {
#if ANDROID
        public Task UnlockAsync(string achievementId)
        {
            var activity = Platform.CurrentActivity ?? throw new InvalidOperationException("No Android activity.");

            if (string.IsNullOrWhiteSpace(achievementId)) throw new ArgumentException("Achievement ID is required.", nameof(achievementId));

            PlayGames.GetAchievementsClient(activity).Unlock(achievementId);
            return Task.CompletedTask;
        }
#else
        public Task UnlockAsync(string achievementId) => throw new PlatformNotSupportedException("Play Games achievements are only supported on Android.");
#endif
    }
}

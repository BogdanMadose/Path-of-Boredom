using Path_of_Boredom.Game;
using System.Text.Json;
#if ANDROID
using Android.Gms.Games;
#endif

namespace Path_of_Boredom.Maui
{
    public sealed class NativePlayGamesAchievements : IGameAchievementService
    {
#if ANDROID
        private Dictionary<string, string>? ids;

        internal static bool IsConfigured(Android.Content.Context context) =>
            context.GetString(Resource.String.game_services_project_id) is { Length: > 0 } id && id != "0";

        public async Task<bool> UnlockAsync(string achievementId)
        {
            if (ids is null)
            {
                using var stream = await FileSystem.OpenAppPackageFileAsync("play-games-achievements.json");
                ids = await JsonSerializer.DeserializeAsync<Dictionary<string, string>>(stream) ?? [];
            }
            // An unmapped achievement remains in-game only. A future app launch retries all unlocks.
            if (!ids.TryGetValue(achievementId, out var id) || string.IsNullOrWhiteSpace(id)) return true;
            return await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                var activity = Platform.CurrentActivity;
                if (activity is null || !IsConfigured(activity)) return false;
                var authentication = PlayGames.GetGamesSignInClient(activity).IsAuthenticated();
                if (!await CompletedAsync(authentication)
                    || authentication.Result is not AuthenticationResult { IsAuthenticated: true }) return false;
                return await CompletedAsync(PlayGames.GetAchievementsClient(activity).UnlockImmediate(id));
            });
        }

        public Task<bool> SignInAsync() => MainThread.InvokeOnMainThreadAsync(async () =>
        {
            var activity = Platform.CurrentActivity;
            if (activity is null || !IsConfigured(activity)) return false;
            var task = PlayGames.GetGamesSignInClient(activity).SignIn();
            return await CompletedAsync(task)
                && task.Result is AuthenticationResult { IsAuthenticated: true };
        });

        private static async Task<bool> CompletedAsync(Android.Gms.Tasks.Task task)
        {
            for (var attempt = 0; attempt < 200 && !task.IsComplete; attempt++) await Task.Delay(100);
            return task.IsComplete && task.IsSuccessful;
        }
#else
        public Task<bool> UnlockAsync(string achievementId) => Task.FromResult(true);
        public Task<bool> SignInAsync() => Task.FromResult(false);
#endif
    }
}

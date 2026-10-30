using Microsoft.JSInterop;
using Path_of_Boredom.Game;
using Path_of_Boredom.ServiceDefaults;
using System.Text.Json;

namespace Path_of_Boredom.Itch
{
    public sealed class BrowserGameSession(IJSRuntime js): IGameSession
    {
        private const string SavePrefix = "pob.itch.save.";
        private const string ProfileKey = "pob.itch.profile";

        public Task<string> GetPlayerNameAsync() => Task.FromResult("Guest");

        public Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch) => Task.FromResult<IReadOnlyList<RankingRow>?>(null);

        public async Task<IReadOnlyList<GameSaveSlotInfo>> GetSaveSlotsAsync()
        {
            var slots = new List<GameSaveSlotInfo>();

            for (var slot = 1; slot <= 5; slot++)
            {
                var json = await js.InvokeAsync<string>("localStorage.getItem", SavePrefix + slot);
                slots.Add(new GameSaveSlotInfo(slot, !string.IsNullOrWhiteSpace(json)));
            }

            return slots;
        }

        public async Task<GameSaveResult> LoadAsync(int slot)
        {
            if (slot is < 1 or > 5) return new(false, "Invalid slot number.");

            var json = await js.InvokeAsync<string>("localStorage.getItem", SavePrefix + slot);

            if (string.IsNullOrWhiteSpace(json)) return new(false, "No save data found in the selected slot.");

            try
            {
                using var document = JsonDocument.Parse(json);
                return new(true, "Save loaded.", document.RootElement.Clone());
            }
            catch (JsonException)
            {
                return new(false, "The save data is invalid.");
            }
        }

        public Task<bool> RegisterPlayerAsync() => Task.FromResult(false);

        public async Task<GameSaveResult> SaveAsync(JsonElement snapshot, int slot)
        {
            if (slot is < 1 or > 5) return new(false, "Invalid save slot.");

            try
            {
                await js.InvokeVoidAsync("localStorage.setItem", SavePrefix + slot, snapshot.GetRawText());
                return new(true, "Game saved in this browser.");
            }
            catch (Exception)
            {
                return new(false, "Could not save in this browser. Check storage settings.");
            }
        }

        public Task<bool> SubmitScoreAsync(ScoreSubmission submission) => Task.FromResult(false);
    }
}

namespace Path_of_Boredom.Game
{
    public interface IGameAchievementService
    {
        Task<bool> UnlockAsync(string achievementId);
        Task<bool> SignInAsync();
    }
}
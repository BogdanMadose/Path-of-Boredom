namespace Path_of_Boredom.Game
{
    public interface IGameAchievementService
    {
        Task UnlockAsync(string achievementId);
    }
}
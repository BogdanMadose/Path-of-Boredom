namespace Path_of_Boredom.Game;

public sealed record GameEdition(bool IsDemo)
{
    public static GameEdition Full { get; } = new(false);
    public static GameEdition Demo { get; } = new(true);
}

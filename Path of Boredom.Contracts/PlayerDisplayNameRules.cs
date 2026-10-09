namespace Path_of_Boredom.ServiceDefaults;

public static class PlayerDisplayNameRules
{
    public const int MinimumLength = 3;
    public const int MaximumLength = 24;
    public const string Guidance = "Use 3–24 letters, numbers, spaces, dots, hyphens or underscores.";

    public static bool TryNormalize(string? value, out string name)
    {
        name = string.Empty;
        if (value is null || value.Length > 100) return false;
        try { name = value.Trim().Normalize(System.Text.NormalizationForm.FormC); }
        catch (ArgumentException) { return false; }
        return name.Length is >= MinimumLength and <= MaximumLength
            && name.All(character => char.IsLetterOrDigit(character) || character is ' ' or '.' or '-' or '_');
    }
}

namespace Path_of_Boredom.ServiceDefaults;

public sealed class SaveServiceOptions
{
    public const string SectionName = "SaveService";
    public const string AuthenticationScheme = "SaveService";
    public const string UserNameHeader = "X-Windows-User";
    public const string UserSidHeader = "X-Windows-Sid";

    public string ApiKey { get; set; } = string.Empty;

    public static bool IsValidApiKey(string? key) => key is { Length: 64 } && key.All(char.IsAsciiHexDigit);
}
using System.Text.Json;

namespace Path_of_Boredom.ServiceDefaults;

/// <summary>
/// The outcome of a save or load operation, returned all the way back to JS via the Home.razor
/// [JSInvokable] bridge methods.
/// </summary>
/// <remarks>
/// This lives in ServiceDefaults rather than in the Web project because it crosses the
/// <c>IGameSession</c> seam: the shared game components return it, and both the Blazor Server head
/// and the MAUI Hybrid head produce it from entirely different transports.
/// </remarks>
/// <param name="Success">Whether the operation succeeded.</param>
/// <param name="Message">A message safe to display directly to the player, explaining success or (on failure) what went wrong and what to do next.</param>
/// <param name="Save">The loaded save payload, present only on a successful load.</param>
/// <param name="EndlessUnlocked">Whether this account has permanently unlocked Endless mode, echoed back from the API so the client doesn't need a separate call to know.</param>
public sealed record GameSaveResult(bool Success, string Message, JsonElement? Save = null, bool EndlessUnlocked = false);

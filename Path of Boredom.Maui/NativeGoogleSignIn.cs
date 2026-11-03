namespace Path_of_Boredom.Maui;

/// <summary>Native account picker. ID tokens stay in memory and are verified by the API.</summary>
public static class NativeGoogleSignIn
{
#if ANDROID
    private sealed class Callback<TResult> : Java.Lang.Object, AndroidX.Credentials.ICredentialManagerCallback where TResult : Java.Lang.Object
    {
        private readonly TaskCompletionSource<TResult> completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task<TResult> Task => completion.Task;

        public void OnResult(Java.Lang.Object? result)
        {
            if (result is TResult typed) completion.TrySetResult(typed);
            else completion.TrySetException(new InvalidOperationException("Unexpected credential result."));
        }

        public void OnError(Java.Lang.Object error) =>
            completion.TrySetException(new InvalidOperationException(error.ToString() ?? "Google sign-in failed."));
    }

    private static async Task<string?> RequestTokenAsync(string webClientId, bool silent)
    {
        var activity = Platform.CurrentActivity ?? throw new InvalidOperationException("No Android activity.");
        AndroidX.Credentials.CredentialOption option = silent
            ? new Google.Android.Libraries.Identity.GoogleId.GetGoogleIdOption.Builder()
                .SetFilterByAuthorizedAccounts(true)
                .SetServerClientId(webClientId)
                .SetAutoSelectEnabled(true)
                .Build()
            : new Google.Android.Libraries.Identity.GoogleId.GetSignInWithGoogleOption.Builder(webClientId).Build();
        var request = new AndroidX.Credentials.GetCredentialRequest.Builder().AddCredentialOption(option).Build();
        var callback = new Callback<AndroidX.Credentials.GetCredentialResponse>();
        await MainThread.InvokeOnMainThreadAsync(() =>
            AndroidX.Credentials.CredentialManager.Create(activity).GetCredentialAsync(activity, request,
                new Android.OS.CancellationSignal(), Java.Util.Concurrent.Executors.NewSingleThreadExecutor()!, callback));
        var response = await callback.Task.WaitAsync(TimeSpan.FromMinutes(2));
        if (response.Credential is AndroidX.Credentials.CustomCredential custom
            && custom.Type == Google.Android.Libraries.Identity.GoogleId.GoogleIdTokenCredential.TypeGoogleIdTokenCredential)
        {
            var token = Google.Android.Libraries.Identity.GoogleId.GoogleIdTokenCredential.CreateFrom(custom.Data).IdToken;
            return string.IsNullOrWhiteSpace(token) ? null : token;
        }
        return null;
    }

    public static async Task<string?> TrySilentSignInAsync(string webClientId)
    {
        try { return await RequestTokenAsync(webClientId, silent: true); }
        catch (Exception) { return null; }
    }

    public static async Task<string?> SignInAsync(string webClientId)
    {
        try { return await RequestTokenAsync(webClientId, silent: false); }
        catch (Exception ex)
        {
            throw new InvalidOperationException("Google sign-in failed. Check the Web client ID and installed app's signing certificate.", ex);
        }
    }

    public static async Task SignOutAsync()
    {
        var activity = Platform.CurrentActivity ?? throw new InvalidOperationException("No Android activity.");
        var callback = new Callback<Java.Lang.Void>();
        await MainThread.InvokeOnMainThreadAsync(() =>
            AndroidX.Credentials.CredentialManager.Create(activity).ClearCredentialStateAsync(
                new AndroidX.Credentials.ClearCredentialStateRequest(),
                new Android.OS.CancellationSignal(), Java.Util.Concurrent.Executors.NewSingleThreadExecutor()!, callback));
        try { await callback.Task.WaitAsync(TimeSpan.FromSeconds(20)); }
        catch (TimeoutException) { throw new TimeoutException("Google account cleanup timed out."); }
    }

    // Credential Manager has no separate revoke; clearing credential state is the closest equivalent.
    public static Task RevokeAccessAsync() => SignOutAsync();
#else
    public static Task<string?> TrySilentSignInAsync(string webClientId) => Task.FromResult<string?>(null);
    public static Task<string?> SignInAsync(string webClientId) =>
        throw new NotSupportedException("Google sign-in is currently available on Android only.");
    public static Task SignOutAsync() => Task.CompletedTask;
    public static Task RevokeAccessAsync() => Task.CompletedTask;
#endif
}

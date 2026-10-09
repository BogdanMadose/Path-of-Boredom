namespace Path_of_Boredom.Maui;

/// <summary>Native account picker. ID tokens stay in memory and are verified by the API.</summary>
public static class NativeGoogleSignIn
{
#if ANDROID
    internal const int RequestCode = 7431;
    private static TaskCompletionSource<string?>? pending;

    public static async Task<string?> SignInAsync(string webClientId)
    {
        if (pending is not null) throw new InvalidOperationException("Sign-in is already open.");
        var completion = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending = completion;
        try
        {
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                var activity = Platform.CurrentActivity ?? throw new InvalidOperationException("No Android activity.");
                var options = new Android.Gms.Auth.Api.SignIn.GoogleSignInOptions.Builder(
                    Android.Gms.Auth.Api.SignIn.GoogleSignInOptions.DefaultSignIn)
                    .RequestIdToken(webClientId).RequestEmail().Build();
                var client = Android.Gms.Auth.Api.SignIn.GoogleSignIn.GetClient(activity, options);
                activity.StartActivityForResult(client.SignInIntent, RequestCode);
            });
            return await completion.Task.WaitAsync(TimeSpan.FromMinutes(2));
        }
        finally { pending = null; }
    }

    internal static void Complete(Android.App.Result result, Android.Content.Intent? data)
    {
        if (pending is null) return;
        if (result != Android.App.Result.Ok || data is null) { pending.TrySetResult(null); return; }
        try
        {
            var task = Android.Gms.Auth.Api.SignIn.GoogleSignIn.GetSignedInAccountFromIntent(data);
            if (task.IsSuccessful && task.Result is Android.Gms.Auth.Api.SignIn.GoogleSignInAccount account
                && !string.IsNullOrWhiteSpace(account.IdToken)) pending.TrySetResult(account.IdToken);
            else pending.TrySetException(new InvalidOperationException("Google sign-in failed. Check the Web client ID and installed app's signing certificate."));
        }
        catch (Exception) { pending.TrySetException(new InvalidOperationException("Google sign-in failed.")); }
    }

    public static Task SignOutAsync() => MainThread.InvokeOnMainThreadAsync(() =>
    {
        var activity = Platform.CurrentActivity;
        if (activity is not null)
            Android.Gms.Auth.Api.SignIn.GoogleSignIn.GetClient(activity,
                Android.Gms.Auth.Api.SignIn.GoogleSignInOptions.DefaultSignIn).SignOut();
    });
#else
    public static Task<string?> SignInAsync(string webClientId) =>
        throw new NotSupportedException("Google sign-in is currently available on Android only.");
    public static Task SignOutAsync() => Task.CompletedTask;
#endif
}

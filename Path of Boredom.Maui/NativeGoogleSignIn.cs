namespace Path_of_Boredom.Maui;

/// <summary>Native account picker. ID tokens stay in memory and are verified by the API.</summary>
public static class NativeGoogleSignIn
{
#if ANDROID
    internal const int RequestCode = 7431;
    private static TaskCompletionSource<string?>? pending;

    public static async Task<string?> TrySilentSignInAsync(string webClientId)
    {
        var task = await MainThread.InvokeOnMainThreadAsync(() =>
        {
            var activity = Platform.CurrentActivity ?? throw new InvalidOperationException("No Android activity.");
            var options = new Android.Gms.Auth.Api.SignIn.GoogleSignInOptions.Builder(
                Android.Gms.Auth.Api.SignIn.GoogleSignInOptions.DefaultSignIn).RequestIdToken(webClientId).RequestEmail().Build();
            return Android.Gms.Auth.Api.SignIn.GoogleSignIn.GetClient(activity, options).SilentSignIn();
        });
        for (var attempt = 0; attempt < 100 && !task.IsComplete; attempt++) await Task.Delay(100);
        return task.IsComplete && task.IsSuccessful && task.Result is Android.Gms.Auth.Api.SignIn.GoogleSignInAccount account
            ? account.IdToken : null;
    }

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

    private static async Task WaitForCleanupAsync(Android.Gms.Tasks.Task task)
    {
        for (var attempt = 0; attempt < 200 && !task.IsComplete; attempt++) await Task.Delay(100);
        if (!task.IsComplete) throw new TimeoutException("Google account cleanup timed out.");
        if (!task.IsSuccessful) throw new InvalidOperationException("Google account cleanup failed.");
    }

    public static async Task SignOutAsync()
    {
        var task = await MainThread.InvokeOnMainThreadAsync(() =>
        {
            var activity = Platform.CurrentActivity ?? throw new InvalidOperationException("No Android activity.");
            return Android.Gms.Auth.Api.SignIn.GoogleSignIn.GetClient(activity,
                Android.Gms.Auth.Api.SignIn.GoogleSignInOptions.DefaultSignIn).SignOut();
        });
        await WaitForCleanupAsync(task);
    }

    public static async Task RevokeAccessAsync()
    {
        try
        {
            var task = await MainThread.InvokeOnMainThreadAsync(() =>
            {
                var activity = Platform.CurrentActivity ?? throw new InvalidOperationException("No Android activity.");
                return Android.Gms.Auth.Api.SignIn.GoogleSignIn.GetClient(activity,
                    Android.Gms.Auth.Api.SignIn.GoogleSignInOptions.DefaultSignIn).RevokeAccess();
            });
            await WaitForCleanupAsync(task);
        }
        finally { await SignOutAsync(); }
    }
#else
    public static Task<string?> TrySilentSignInAsync(string webClientId) => Task.FromResult<string?>(null);
    public static Task<string?> SignInAsync(string webClientId) =>
        throw new NotSupportedException("Google sign-in is currently available on Android only.");
    public static Task SignOutAsync() => Task.CompletedTask;
    public static Task RevokeAccessAsync() => Task.CompletedTask;
#endif
}

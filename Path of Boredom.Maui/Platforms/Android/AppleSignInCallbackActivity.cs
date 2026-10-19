using Android.App;
using Android.Content;
using Android.Content.PM;

namespace Path_of_Boredom.Maui;

/// <summary>Receives pathofboredom://apple-signin after Apple's web sign-in completes.</summary>
[Activity(NoHistory = true, LaunchMode = LaunchMode.SingleTop, Exported = true)]
[IntentFilter([Intent.ActionView],
    Categories = [Intent.CategoryDefault, Intent.CategoryBrowsable],
    DataScheme = NativeAppleSignIn.CallbackScheme, DataHost = "apple-signin")]
public class AppleSignInCallbackActivity : WebAuthenticatorCallbackActivity;

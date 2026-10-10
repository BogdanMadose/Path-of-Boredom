namespace Path_of_Boredom.Maui;

public partial class App : Application
{
    public App() => InitializeComponent();

    protected override Window CreateWindow(IActivationState? activationState)
    {
        var page = new MainPage();
        var window = new Window(page) { Title = "Path of Boredom" };
        window.Stopped += (_, _) => page.SuspendGame();
        return window;
    }
}

namespace Path_of_Boredom.Maui;

public partial class App : Application
{
    public App() => InitializeComponent();

    protected override Window CreateWindow(IActivationState? activationState) =>
        new(new MainPage()) { Title = "Path of Boredom" };
}

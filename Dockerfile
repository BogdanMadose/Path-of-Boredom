FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY ["Path of Boredom.ApiService/Path of Boredom.ApiService.csproj", "Path of Boredom.ApiService/"]
COPY ["Path of Boredom.ServiceDefaults/Path of Boredom.ServiceDefaults.csproj", "Path of Boredom.ServiceDefaults/"]
COPY ["Path of Boredom.Contracts/Path of Boredom.Contracts.csproj", "Path of Boredom.Contracts/"]
RUN dotnet restore "Path of Boredom.ApiService/Path of Boredom.ApiService.csproj" -p:TargetFramework=net9.0 -p:TargetFrameworks=net9.0

COPY ["Path of Boredom.ApiService/", "Path of Boredom.ApiService/"]
COPY ["Path of Boredom.ServiceDefaults/", "Path of Boredom.ServiceDefaults/"]
COPY ["Path of Boredom.Contracts/", "Path of Boredom.Contracts/"]
RUN dotnet publish "Path of Boredom.ApiService/Path of Boredom.ApiService.csproj" -f net9.0 -p:TargetFrameworks=net9.0 -c Release --no-restore -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "Path of Boredom.ApiService.dll"]

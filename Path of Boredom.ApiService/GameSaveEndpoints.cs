using System.Security.Claims;
using System.Text.Json;

namespace Path_of_Boredom.ApiService;

public static class GameSaveEndpoints
{
    public static void MapGameSaves(this WebApplication app)
    {
        app.MapGet("/game/save", async (HttpContext context, GameSaveStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var ownerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var save = await store.LoadAsync(ownerId, context.RequestAborted);
            return save is null ? Results.NotFound() : Results.Ok(save);
        }).RequireAuthorization();

        app.MapPut("/game/save", async (HttpContext context, GameSaveStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var ownerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;

            if (!context.Request.HasJsonContentType())
            {
                return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
            }

            const int maximumBytes = 64 * 1024;
            var buffer = new byte[maximumBytes + 1];
            var length = 0;
            while (length < buffer.Length)
            {
                var read = await context.Request.Body.ReadAsync(buffer.AsMemory(length), context.RequestAborted);
                if (read == 0) break;
                length += read;
            }

            if (length > maximumBytes)
            {
                return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            }

            try
            {
                using var document = JsonDocument.Parse(buffer.AsMemory(0, length), new JsonDocumentOptions { MaxDepth = 8 });
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object
                    || !root.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.Number
                    || !version.TryGetInt32(out var number) || number is not (1 or 2 or 3 or 4)
                    || !root.TryGetProperty("state", out var state) || !IsValidState(state, number))
                {
                    return Results.BadRequest(new { message = "Invalid or unsupported save." });
                }

                var save = await store.SaveAsync(ownerId, context.User.Identity!.Name!, state, number, context.RequestAborted);
                return Results.Ok(new { save.SavedAt, save.EndlessUnlocked });
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { message = "Invalid save JSON." });
            }
        }).RequireAuthorization();
    }

    private static bool IsValidState(JsonElement state, int version)
    {
        if (!IsBounded(state)
            || !Numbers(state, "time", "wave", "intermission", "kills", "gold")
            || !state.TryGetProperty("status", out var status) || status.ValueKind != JsonValueKind.String
            || status.GetString() is not ("playing" or "paused" or "camp" or "won" or "choosing")
            || !state.TryGetProperty("player", out var player)
            || !Numbers(player, "x", "y", "radius", "facing", "health", "maxHealth", "level", "xp", "nextLevel", "damage", "weaponBonus", "potions", "attack", "nova", "dodge", "potion", "invulnerable", "rolling", "rollX", "rollY")
            || !player.TryGetProperty("weapon", out var weapon) || weapon.ValueKind != JsonValueKind.String
            || player.GetProperty("health").GetDouble() <= 0
            || player.GetProperty("health").GetDouble() > player.GetProperty("maxHealth").GetDouble()
            || state.GetProperty("wave").GetDouble() < 0
            || state.GetProperty("wave").GetDouble() % 1 != 0)
        {
            return false;
        }

        var wave = state.GetProperty("wave").GetDouble();
        var mode = "campaign";
        var completed = 0d;
        if (version >= 2)
        {
            if (!state.TryGetProperty("mode", out var modeValue) || modeValue.ValueKind != JsonValueKind.String
                || modeValue.GetString() is not ("campaign" or "endless")
                || !Numbers(state, "campaignComplete")
                || !state.TryGetProperty("upgrades", out var upgrades)
                || !Numbers(upgrades, "weapon", "armor", "cleave", "nova", "dodge", "flask")
                || !Numbers(player, "armorBonus") || player.GetProperty("armorBonus").GetDouble() is < 0 or > 40
                || !player.TryGetProperty("armor", out var armor) || armor.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            mode = modeValue.GetString()!;
            completed = state.GetProperty("campaignComplete").GetDouble();
            if (completed is not (0 or 1)) return false;
            foreach (var upgrade in upgrades.EnumerateObject())
            {
                var max = upgrade.Name switch { "weapon" => 50, "armor" => 12, "flask" => 5, _ => 8 };
                if (upgrade.Value.ValueKind != JsonValueKind.Number || !upgrade.Value.TryGetInt32(out var rank) || rank < 0 || rank > max) return false;
            }
        }

        if ((mode == "campaign" && wave > 30) || (mode == "endless" && (wave < 30 || completed != 1))) return false;
        if (status.GetString() == "camp" && (wave <= 0 || wave % 5 != 0 || (mode == "campaign" ? wave >= 30 : wave <= 30))) return false;
        if (status.GetString() == "won" && (mode != "campaign" || wave != 30 || completed != 1)) return false;
        if (status.GetString() is "camp" or "won"
            && (!state.TryGetProperty("enemies", out var remaining) || remaining.ValueKind != JsonValueKind.Array || remaining.GetArrayLength() != 0)) return false;

        if (version >= 3)
        {
            if (!state.TryGetProperty("buffs", out var buffs) || !Numbers(buffs, "fury", "haste", "ward", "magnet")) return false;
            foreach (var buff in buffs.EnumerateObject())
            {
                var maximum = buff.Name switch { "fury" => 15, "haste" => 12, "ward" => 10, "magnet" => 20, _ => -1 };
                if (buff.Value.ValueKind != JsonValueKind.Number || !buff.Value.TryGetDouble(out var duration) || duration < 0 || duration > maximum) return false;
            }
        }

        if (version >= 4)
        {
            if (!ValidCardProgress(state, player, status.GetString()!)) return false;
        }
        else if (status.GetString() == "choosing") return false;

        return ValidArray(state, "enemies", item =>
                Numbers(item, "x", "y", "health", "maxHealth", "radius", "speed", "damage", "cooldown", "flash", "slam", "winding")
                && Kind(item, "husk", "wisp", "brute", "runner", "spitter", "sentinel", "reaver", "bomber", "summoner", "cantor", "hexer", "boss"))
            && ValidArray(state, "projectiles", item => Numbers(item, "x", "y", "vx", "vy", "life", "damage"))
            && ValidArray(state, "loot", item => Numbers(item, "x", "y", "value", "life")
                && Kind(item, "gold", "weapon", "armor", "health", "power", "upgrade")
                && (!Kind(item, "power", "upgrade") || (item.GetProperty("value").TryGetInt32(out var index)
                    && index >= 0 && index < (Kind(item, "power") ? 4 : 6))));
    }

    private static bool ValidCardProgress(JsonElement state, JsonElement player, string status)
    {
        string[] keys = ["edge", "vitality", "bulwark", "stride", "focus", "nova", "cleave", "harvest", "siphon", "fortune"];
        if (!state.TryGetProperty("boons", out var boons) || !Numbers(boons, keys)
            || boons.EnumerateObject().Count() != keys.Length
            || !state.TryGetProperty("pendingChoices", out var pendingValue) || pendingValue.ValueKind != JsonValueKind.Number
            || !pendingValue.TryGetInt64(out var pending) || pending < 0
            || !player.GetProperty("level").TryGetInt64(out var level) || level < 1
            || !state.TryGetProperty("cardChoices", out var choices) || choices.ValueKind != JsonValueKind.Array
            || choices.GetArrayLength() != (pending > 0 ? 3 : 0)
            || (pending > 0) != (status == "choosing")) return false;

        long total = pending;
        foreach (var key in keys)
        {
            var maximum = key is "edge" or "vitality" or "fortune" ? 9_007_199_254_740_991L : 10;
            if (!boons.GetProperty(key).TryGetInt64(out var rank) || rank < 0 || rank > maximum) return false;
            total += rank;
        }
        if (total > level - 1) return false;

        var offered = new HashSet<string>(StringComparer.Ordinal);
        foreach (var choice in choices.EnumerateArray())
        {
            if (choice.ValueKind != JsonValueKind.String || choice.GetString() is not { } key
                || !keys.Contains(key) || !offered.Add(key)) return false;
            var maximum = key is "edge" or "vitality" or "fortune" ? 9_007_199_254_740_991L : 10;
            if (boons.GetProperty(key).GetInt64() >= maximum) return false;
        }
        return true;
    }

    private static bool Numbers(JsonElement item, params string[] names) =>
        item.ValueKind == JsonValueKind.Object && names.All(name =>
            item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number
            && value.TryGetDouble(out var number) && double.IsFinite(number) && Math.Abs(number) <= 9_007_199_254_740_991);

    private static bool Kind(JsonElement item, params string[] kinds) =>
        item.TryGetProperty("kind", out var kind) && kind.ValueKind == JsonValueKind.String && kinds.Contains(kind.GetString());

    private static bool ValidArray(JsonElement state, string name, Func<JsonElement, bool> validate) =>
        state.TryGetProperty(name, out var array) && array.ValueKind == JsonValueKind.Array
        && array.GetArrayLength() <= 128 && array.EnumerateArray().All(validate);

    private static bool IsBounded(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => value.EnumerateObject().Count() <= 32
            && value.EnumerateObject().All(property => property.Name.Length <= 40 && IsBounded(property.Value)),
        JsonValueKind.Array => value.GetArrayLength() <= 128 && value.EnumerateArray().All(IsBounded),
        JsonValueKind.String => value.GetString()!.Length <= 200,
        JsonValueKind.Number => value.TryGetDouble(out var number) && double.IsFinite(number) && Math.Abs(number) <= 9_007_199_254_740_991,
        _ => false
    };
}

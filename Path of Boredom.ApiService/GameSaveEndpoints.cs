using System.Security.Claims;
using System.Text.Json;

namespace Path_of_Boredom.ApiService;

public static class GameSaveEndpoints
{
    public const int CurrentSaveVersion = 14;
    public static void MapGameSaves(this WebApplication app)
    {
        app.MapGet("/game/save", async (HttpContext context, GameSaveStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var ownerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
            try
            {
                var save = await store.LoadAsync(ownerId, context.RequestAborted);
                return save is null ? Results.NotFound() : Results.Ok(save);
            }
            catch (JsonException exception)
            {
                app.Logger.LogError(exception, "Stored save JSON could not be loaded; reference: {Reference}", context.TraceIdentifier);
                return Results.Json(new { code = "CorruptStoredSave", message = "The stored save JSON is unreadable.", reference = context.TraceIdentifier }, statusCode: StatusCodes.Status500InternalServerError);
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                app.Logger.LogError(exception, "Save storage access failed while loading; reference: {Reference}", context.TraceIdentifier);
                return Results.Json(new { code = "SaveStorageUnavailable", message = "The server could not access save storage.", reference = context.TraceIdentifier }, statusCode: StatusCodes.Status500InternalServerError);
            }
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

            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(buffer.AsMemory(0, length), new JsonDocumentOptions { MaxDepth = 8 });
            }
            catch (JsonException exception)
            {
                app.Logger.LogWarning(exception, "Save request JSON parsing failed. Bytes: {Bytes}; reference: {Reference}", length, context.TraceIdentifier);
                return Results.BadRequest(new { code = "InvalidSaveJson", message = "Invalid save request JSON.", supportedVersion = CurrentSaveVersion, reference = context.TraceIdentifier });
            }

            using (document)
            {
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object
                    || !root.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.Number
                    || !version.TryGetInt32(out var number))
                {
                    return Results.BadRequest(new { code = "InvalidSaveEnvelope", message = "The save version is missing or invalid.", supportedVersion = CurrentSaveVersion });
                }
                if (number is < 1 or > CurrentSaveVersion)
                {
                    return Results.BadRequest(new { code = "UnsupportedSaveVersion", message = "This API does not support the submitted save format.", supportedVersion = CurrentSaveVersion });
                }
                if (!root.TryGetProperty("state", out var state) || !IsValidState(state, number))
                {
                    return Results.BadRequest(new { code = "InvalidSaveState", message = "The submitted run failed save validation.", supportedVersion = CurrentSaveVersion });
                }

                try
                {
                    var save = await store.SaveAsync(ownerId, context.User.Identity!.Name!, state, number, context.RequestAborted);
                    return Results.Ok(new { save.SavedAt, save.EndlessUnlocked, save.RecoveredFromCorruptSave });
                }
                catch (JsonException exception)
                {
                    app.Logger.LogError(exception, "Save storage JSON processing failed for a validated format {Version} request; reference: {Reference}", number, context.TraceIdentifier);
                    return Results.Json(new { code = "SaveStorageJsonError", message = "The server could not process stored save JSON.", reference = context.TraceIdentifier }, statusCode: StatusCodes.Status500InternalServerError);
                }
                catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
                {
                    app.Logger.LogError(exception, "Save storage access failed for a validated format {Version} request; reference: {Reference}", number, context.TraceIdentifier);
                    return Results.Json(new { code = "SaveStorageUnavailable", message = "The server could not access save storage.", reference = context.TraceIdentifier }, statusCode: StatusCodes.Status500InternalServerError);
                }
            }
        }).RequireAuthorization();
    }

    private static bool IsValidState(JsonElement state, int version)
    {
        string[] upgradeKeys = version >= 9
            ? ["weapon", "armor", "cleave", "nova", "dodge", "flask", "critChance", "critDamage", "burst", "guard"]
            : version >= 8
            ? ["weapon", "armor", "cleave", "nova", "dodge", "flask", "critChance", "critDamage"]
            : ["weapon", "armor", "cleave", "nova", "dodge", "flask"];
        string[] masteryKeys = version >= 8
            ? ["might", "vitality", "recovery", "area", "speed", "critChance", "critDamage"]
            : ["might", "vitality", "recovery"];
        if (version >= 5 && (state.ValueKind != JsonValueKind.Object
            || !state.TryGetProperty("difficulty", out var difficulty) || difficulty.ValueKind != JsonValueKind.String
            || !state.TryGetProperty("rankingMode", out var rankingMode) || rankingMode.ValueKind != JsonValueKind.String
            || !(difficulty.GetString() == "legacy" && rankingMode.GetString() == "legacy"
                || Path_of_Boredom.ServiceDefaults.RankingRules.IsDifficulty(difficulty.GetString())
                    && (Path_of_Boredom.ServiceDefaults.RankingRules.IsMode(rankingMode.GetString())
                        || version >= 6 && rankingMode.GetString() == "legacy")))) return false;
        if (!IsBounded(state)
            || !Numbers(state, "time", "wave", "intermission", "kills", "gold")
            || !state.TryGetProperty("status", out var status) || status.ValueKind != JsonValueKind.String
            || status.GetString() is not ("playing" or "paused" or "camp" or "won" or "choosing")
            || !state.TryGetProperty("player", out var player)
            || !Numbers(player, "x", "y", "radius", "facing", "health", "maxHealth", "level", "xp", "nextLevel", "damage", "weaponBonus", "potions", "attack", "nova", "dodge", "potion", "invulnerable", "rolling", "rollX", "rollY")
            || !player.TryGetProperty("weapon", out var weapon) || weapon.ValueKind != JsonValueKind.String
            || player.GetProperty("health").GetDouble() <= 0
            || player.GetProperty("health").GetDouble() > player.GetProperty("maxHealth").GetDouble()
            || !player.GetProperty("potions").TryGetInt32(out var potions) || potions is < 0 or > 5
            || state.GetProperty("wave").GetDouble() < 0
            || state.GetProperty("wave").GetDouble() % 1 != 0)
        {
            return false;
        }

        var wave = state.GetProperty("wave").GetDouble();
        long volleySequence = 2;
        if (version >= 14 && (!Numbers(state, "volleySequence") || !state.GetProperty("volleySequence").TryGetInt64(out volleySequence) || volleySequence < 2)) return false;
        if (version >= 13 && (!state.TryGetProperty("rankingPatch", out var rankingPatch)
            || rankingPatch.ValueKind != JsonValueKind.String
            || !Path_of_Boredom.ServiceDefaults.RankingRules.IsPatch(rankingPatch.GetString()))) return false;
        if (version >= 7)
        {
            if (!state.TryGetProperty("heroClass", out var heroClass) || heroClass.ValueKind != JsonValueKind.String
                || !Path_of_Boredom.ServiceDefaults.RankingRules.IsClass(heroClass.GetString())
                || !ValidArray(state, "playerShots", shot => Numbers(shot, "x", "y", "vx", "vy", "life", "damage", "piercing")
                    && shot.GetProperty("life").GetDouble() is > 0 and <= 2
                    && shot.GetProperty("damage").GetDouble() > 0
                    && (version < 9 || shot.TryGetProperty("skill", out var shotSkill) && shotSkill.ValueKind == JsonValueKind.String && shotSkill.GetString() is ("attack" or "nova" or "burst"))
                    && (version < 14 || Numbers(shot, "volley") && shot.GetProperty("volley").TryGetInt64(out var volley)
                        && (shot.GetProperty("skill").GetString() == "attack" ? volley == 0 : volley >= 1 && volley <= volleySequence))
                    && shot.GetProperty("piercing").TryGetInt32(out var piercing) && piercing is 0 or 1)) return false;
            var count = state.GetProperty("playerShots").GetArrayLength();
            if (count > 48 || heroClass.GetString() != "ranger" && count != 0) return false;
        }
        if (version >= 6)
        {
            if (!state.TryGetProperty("scoreBaseline", out var baseline) || baseline.ValueKind != JsonValueKind.Number || !baseline.TryGetInt64(out var startScore)
                || !state.GetProperty("kills").TryGetInt64(out var kills) || startScore < 0 || startScore > kills
                || !state.TryGetProperty("mastery", out var mastery) || !Numbers(mastery, masteryKeys)
                || mastery.EnumerateObject().Count() != masteryKeys.Length) return false;
            long total = 0;
            foreach (var stat in mastery.EnumerateObject())
            {
                if (!stat.Value.TryGetInt64(out var rank) || rank < 0) return false;
                total += rank;
            }
            if (total > 9_007_199_254_740_991L) return false;
            if (total > 0 && (!state.TryGetProperty("upgrades", out var forge) || !Numbers(forge, upgradeKeys)
                || forge.EnumerateObject().Count() != upgradeKeys.Length
                || forge.EnumerateObject().Any(item => item.Value.GetDouble() != (item.Name switch { "weapon" => 50, "armor" => 12, "flask" => 5, _ => 8 })))) return false;
        }
        var mode = "campaign";
        var completed = 0d;
        if (version >= 2)
        {
            if (!state.TryGetProperty("mode", out var modeValue) || modeValue.ValueKind != JsonValueKind.String
                || modeValue.GetString() is not ("campaign" or "endless")
                || !Numbers(state, "campaignComplete")
                || !state.TryGetProperty("upgrades", out var upgrades)
                || !Numbers(upgrades, upgradeKeys) || upgrades.EnumerateObject().Count() != upgradeKeys.Length
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
        if (version >= 6 && state.GetProperty("rankingMode").GetString() is ("ascended" or "endless") && mode != "endless") return false;
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
            if (!ValidCardProgress(state, player, status.GetString()!, version)) return false;
        }
        else if (status.GetString() == "choosing") return false;

        if (version >= 9 && !ValidSkillProgress(state, player, version)) return false;

        return ValidArray(state, "enemies", item =>
                Numbers(item, "x", "y", "health", "maxHealth", "radius", "speed", "damage", "cooldown", "flash", "slam", "winding")
                && (version < 13 || ValidEliteModifier(item, wave))
                && (version < 14 || ValidEnemyCombat(item, volleySequence))
                && (version < 12 || Numbers(item, "chilled", "chillStrength")
                    && item.GetProperty("chilled").GetDouble() is >= 0 and <= 1.5
                    && item.GetProperty("chillStrength").GetDouble() is >= 0 and <= 0.3
                    && (item.GetProperty("chilled").GetDouble() > 0 || item.GetProperty("chillStrength").GetDouble() == 0))
                && (version < 9 || Numbers(item, "attackWindup", "attackX", "attackY")
                    && item.GetProperty("attackWindup").GetDouble() is >= 0 and <= 1.1
                    && item.GetProperty("attackX").GetDouble() is >= 0 and <= 1100
                    && item.GetProperty("attackY").GetDouble() is >= 0 and <= 650)
                && (version < 6 || Numbers(item, "charging", "chargeX", "chargeY")
                    && item.GetProperty("charging").GetDouble() >= 0
                    && item.GetProperty("charging").GetDouble() <= (Kind(item, "lancer") ? 1.2 : 0.45)
                    && Math.Abs(item.GetProperty("chargeX").GetDouble()) <= 1
                    && Math.Abs(item.GetProperty("chargeY").GetDouble()) <= 1)
                && Kind(item, "husk", "wisp", "brute", "runner", "spitter", "sentinel", "reaver", "lancer", "bomber", "summoner", "cantor", "hexer", "boss", "duelist", "artillerist"))
            && ValidArray(state, "projectiles", item => Numbers(item, "x", "y", "vx", "vy", "life", "damage")
                && (version < 13 || item.TryGetProperty("source", out var source) && source.ValueKind == JsonValueKind.String
                    && source.GetString() is { Length: > 0 and <= 100 } label && !string.IsNullOrWhiteSpace(label) && !label.Any(char.IsControl)))
            && ValidArray(state, "loot", item => Numbers(item, "x", "y", "value", "life")
                && Kind(item, "gold", "weapon", "armor", "health", "power", "upgrade", "flask")
                && (!Kind(item, "power", "upgrade") || (item.GetProperty("value").TryGetInt32(out var index)
                    && index >= 0 && index < (Kind(item, "power") ? 4 : upgradeKeys.Length))));
    }

    private static bool ValidCardProgress(JsonElement state, JsonElement player, string status, int version)
    {
        string[] keys = version >= 9
            ? ["edge", "vitality", "bulwark", "stride", "focus", "nova", "cleave", "harvest", "siphon", "fortune", "critChance", "critDamage", "burst", "guard"]
            : version >= 8
            ? ["edge", "vitality", "bulwark", "stride", "focus", "nova", "cleave", "harvest", "siphon", "fortune", "critChance", "critDamage"]
            : ["edge", "vitality", "bulwark", "stride", "focus", "nova", "cleave", "harvest", "siphon", "fortune"];
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

    private static bool ValidSkillProgress(JsonElement state, JsonElement player, int version)
    {
        string[] skills = ["attack", "nova", "burst", "guard", "dodge", "potion"];
        string[] slotSkills = version >= 10 ? ["nova", "burst", "guard"] : skills;
        string[] nodes = ["potency", "reach", "ember", "recovery"];
        if (!Numbers(player, "burst", "guard", "guarding") || !Numbers(state, "resumeDelay", "travelPending")
            || state.GetProperty("resumeDelay").GetDouble() is < 0 or > 3
            || !state.GetProperty("travelPending").TryGetInt32(out var travel) || travel is < 0 or > 1
            || player.GetProperty("guarding").GetDouble() is < 0 or > 8
            || skills.Any(key => player.GetProperty(key).GetDouble() is < 0 or > 30)
            || !player.GetProperty("level").TryGetInt64(out var level) || level < 1
            || !state.TryGetProperty("loadout", out var loadout) || loadout.ValueKind != JsonValueKind.Object
            || !loadout.TryGetProperty("manual", out var manual) || manual.ValueKind != JsonValueKind.String || !slotSkills.Contains(manual.GetString())
            || !loadout.TryGetProperty("auto", out var auto) || auto.ValueKind != JsonValueKind.Array || auto.GetArrayLength() != (version >= 10 ? 2 : 3)
            || !state.TryGetProperty("skillTree", out var tree) || tree.ValueKind != JsonValueKind.Object || tree.EnumerateObject().Count() != skills.Length) return false;
        var slotted = new HashSet<string>(StringComparer.Ordinal) { manual.GetString()! };
        foreach (var item in auto.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String || item.GetString() is not { } key) return false;
            if (key != "none" && (!slotSkills.Contains(key) || !slotted.Add(key))) return false;
        }
        if (version >= 11)
        {
            if (!Numbers(state, "wardUnlockSeen") || !state.GetProperty("wardUnlockSeen").TryGetInt32(out var seen) || seen is < 0 or > 1) return false;
            var unlockWave = state.GetProperty("rankingMode").GetString() == "endless" ? 41 : 11;
            if (state.GetProperty("wave").GetDouble() < unlockWave && (slotted.Contains("guard") || player.GetProperty("guarding").GetDouble() != 0)) return false;
        }
        var spent = 0;
        foreach (var skill in skills)
        {
            string[] branchKeys = version < 12 ? nodes : skill switch
            {
                "attack" => ["edge", "sweep", "execution", "rhythm"],
                "nova" => ["amplitude", "resonance", "ignition", "chill"],
                "burst" => ["focus", "aperture", "shatter", "overdrive"],
                "guard" => ["barrier", "duration", "repulse", "refuge"],
                "dodge" => ["agility", "distance", "afterstep", "recovery"],
                _ => ["concentration", "triage", "tonic", "renewal"]
            };
            if (!tree.TryGetProperty(skill, out var branch) || !Numbers(branch, branchKeys) || branch.EnumerateObject().Count() != branchKeys.Length) return false;
            for (var index = 0; index < branchKeys.Length; index++)
            {
                var maximum = index == 0 ? 3 : index == 2 ? 1 : 2;
                if (!branch.GetProperty(branchKeys[index]).TryGetInt32(out var rank) || rank < 0 || rank > maximum) return false;
                spent += rank;
            }
            if ((branch.GetProperty(branchKeys[1]).GetInt32() > 0 || branch.GetProperty(branchKeys[2]).GetInt32() > 0) && branch.GetProperty(branchKeys[0]).GetInt32() == 0) return false;
            if (branch.GetProperty(branchKeys[3]).GetInt32() > 0 && branch.GetProperty(branchKeys[1]).GetInt32() == 0 && branch.GetProperty(branchKeys[2]).GetInt32() == 0) return false;
        }
        if (version >= 12 && (!Numbers(player, "afterstep", "flaskWard", "renewal")
            || player.GetProperty("afterstep").GetDouble() is < 0 or > 1.2
            || player.GetProperty("flaskWard").GetDouble() is < 0 or > 2
            || player.GetProperty("renewal").GetDouble() is < 0 or > 2
            || player.GetProperty("afterstep").GetDouble() > 0 && tree.GetProperty("dodge").GetProperty("afterstep").GetInt32() == 0
            || player.GetProperty("flaskWard").GetDouble() > 0 && tree.GetProperty("potion").GetProperty("tonic").GetInt32() == 0
            || player.GetProperty("renewal").GetDouble() > 0 && tree.GetProperty("potion").GetProperty("renewal").GetInt32() == 0)) return false;
        var pointBudget = version >= 12 ? Math.Min(32, level / 2) : Math.Min(12, level / 5);
        if (spent > pointBudget) return false;
        if (travel == 1 && (state.GetProperty("resumeDelay").GetDouble() <= 0
            || state.GetProperty("wave").GetDouble() <= 0 || state.GetProperty("wave").GetDouble() % 5 != 0
            || state.GetProperty("status").GetString() is not ("playing" or "paused")
            || !state.TryGetProperty("enemies", out var enemies) || enemies.ValueKind != JsonValueKind.Array || enemies.GetArrayLength() != 0
            || state.GetProperty("mode").GetString() == "campaign" && state.GetProperty("wave").GetDouble() >= 30)) return false;
        return true;
    }

    private static bool ValidEnemyCombat(JsonElement item, long sequence)
    {
        if (!item.TryGetProperty("combat", out var combat) || !Numbers(combat, "phase", "rest", "pattern")
            || !combat.GetProperty("phase").TryGetInt32(out var phase) || phase < 1 || phase > (Kind(item, "boss") ? 3 : 1)
            || !combat.GetProperty("pattern").TryGetInt32(out var pattern) || pattern < 1 || pattern > phase
            || combat.GetProperty("rest").GetDouble() < 0 || combat.GetProperty("rest").GetDouble() > (Kind(item, "boss") ? 2 : 0)
            || combat.GetProperty("rest").GetDouble() > 0 && (!Numbers(item, "attackWindup", "winding")
                || item.GetProperty("attackWindup").GetDouble() != 0 || item.GetProperty("winding").GetDouble() != 0)
            || !combat.TryGetProperty("volleys", out var volleys) || volleys.ValueKind != JsonValueKind.Array || volleys.GetArrayLength() > 48) return false;
        var seen = new HashSet<long>();
        foreach (var hit in volleys.EnumerateArray())
        {
            if (!Numbers(hit, "volley", "hits") || !hit.GetProperty("volley").TryGetInt64(out var volley) || volley < 1 || volley > sequence || !seen.Add(volley)
                || !hit.GetProperty("hits").TryGetInt32(out var count) || count is < 1 or > 3) return false;
        }
        return true;
    }

    private static bool ValidEliteModifier(JsonElement item, double wave) =>
        item.TryGetProperty("modifier", out var modifier) && modifier.ValueKind == JsonValueKind.String
        && modifier.GetString() is ("none" or "armored" or "swift" or "mending")
        && Numbers(item, "elite") && item.GetProperty("elite").TryGetInt32(out var elite) && elite is 0 or 1
        && (modifier.GetString() == "none" || elite == 1 && wave >= 11 && !Kind(item, "boss"));

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

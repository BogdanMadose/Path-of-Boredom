using System.Security.Claims;
using System.Text.Json;

namespace Path_of_Boredom.ApiService;

/// <summary>
/// Maps and implements the /game/save GET/PUT endpoints, plus the entire server-side save
/// validation wall (<see cref="IsValidState"/> and its helpers). This is the single most
/// important file to understand before touching the save system: the validation here has to stay
/// in lockstep with arpg-save.js on the client, field for field, version for version — there is
/// no shared schema between the two, they're kept in sync entirely by hand.
/// </summary>
public static class GameSaveEndpoints
{
    /// <summary>
    /// The current save format version this API build accepts. Bump this (and add a new
    /// version-gated branch below) any time the client-side save shape changes in a way that needs
    /// server-side validation — see the Web project's JS runtime README for the full checklist.
    /// </summary>
    public const int CurrentSaveVersion = 15;

    /// <summary>Registers the GET (load) and PUT (save) endpoints under /game/save.</summary>
    public static void MapGameSaves(this WebApplication app)
    {
        // GET /game/save — returns the caller's stored save, or 404 if they've never saved.
        app.MapGet("/game/save", async (HttpContext context, GameSaveStore store) =>
        {
            // Save data is per-request and never safe to cache at any layer (browser, proxy, etc.).
            context.Response.Headers.CacheControl = "no-store";
            // NameIdentifier claim is set by SaveServiceAuthenticationHandler to the SID- or name-based
            // owner key; the `!` is safe here because RequireAuthorization() guarantees this claim exists.
            var ownerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
            try
            {
                var save = await store.LoadAsync(ownerId, context.RequestAborted);
                context.Response.Headers.ETag = $"\"{save?.Revision ?? 0}\"";
                return save is null ? Results.NotFound() : Results.Ok(save);
            }
            catch (JsonException exception)
            {
                // The stored file exists but can't be parsed. This is the case GameSaveClient.cs's
                // "CorruptStoredSave" message handles, and the trigger for the .corrupt backup flow
                // the next time this player successfully saves (see GameSaveStore.SaveAsync).
                app.Logger.LogError(exception, "Stored save JSON could not be loaded; reference: {Reference}", context.TraceIdentifier);
                return Results.Json(new { code = "CorruptStoredSave", message = "The stored save JSON is unreadable.", reference = context.TraceIdentifier }, statusCode: StatusCodes.Status500InternalServerError);
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                // Can't even read the file/folder at all — usually a permissions or disk problem on
                // the host, not something the player caused.
                app.Logger.LogError(exception, "Save storage access failed while loading; reference: {Reference}", context.TraceIdentifier);
                return Results.Json(new { code = "SaveStorageUnavailable", message = "The server could not access save storage.", reference = context.TraceIdentifier }, statusCode: StatusCodes.Status500InternalServerError);
            }
        }).RequireAuthorization().RequireRateLimiting("PlayerRequests");

        // PUT /game/save — validates and persists a new save for the caller.
        app.MapPut("/game/save", async (HttpContext context, GameSaveStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var ownerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;

            long? expectedRevision = null;
            if (context.User.HasClaim(claim => claim.Type == "sub"))
            {
                // Mobile writes must acknowledge the exact cloud revision. Revision zero creates
                // only when no save exists. No blind last-writer-wins or client-clock comparisons.
                var match = context.Request.Headers.IfMatch;
                if (match.Count != 1 || !TryParseRevision(match[0], out var revision))
                    return Results.Json(new { code = "SaveRevisionRequired", message = "Load cloud metadata and submit If-Match with its quoted revision." }, statusCode: 428);
                expectedRevision = revision;
            }

            if (!context.Request.HasJsonContentType()) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);

            // Manually read the request body into a fixed-size buffer instead of letting the JSON
            // deserializer read an unbounded stream — this way an oversized request is rejected the
            // moment it exceeds the cap, without ever fully buffering/parsing a huge payload first.
            const int maximumBytes = 64 * 1024;
            var buffer = new byte[maximumBytes + 1];
            var length = 0;
            while (length < buffer.Length)
            {
                var read = await context.Request.Body.ReadAsync(buffer.AsMemory(length), context.RequestAborted);
                if (read == 0) break;
                length += read;
            }

            if (length > maximumBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

            JsonDocument document;
            try
            {
                // MaxDepth caps how deeply nested the JSON can be — a cheap guard against maliciously
                // deeply-nested JSON designed to blow the stack or waste CPU during parsing.
                document = JsonDocument.Parse(buffer.AsMemory(0, length), new JsonDocumentOptions { MaxDepth = 8 });
            }
            catch (JsonException exception)
            {
                app.Logger.LogWarning(exception, "Save request JSON parsing failed. Bytes: {Bytes}; reference: {Reference}", length, context.TraceIdentifier);
                return Results.BadRequest(new { code = "InvalidSaveJson",
                    message = "Invalid save request JSON.", supportedVersion = CurrentSaveVersion, reference = context.TraceIdentifier });
            }

            using (document)
            {
                var root = document.RootElement;
                // Every save envelope must be a JSON object with a numeric "version" property — this is
                // checked before we even look at the version's value, since a missing/malformed
                // version is a different failure (client bug) from an out-of-range one (version drift).
                if (root.ValueKind != JsonValueKind.Object
                    || !root.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.Number
                    || !version.TryGetInt32(out var number))
                    return Results.BadRequest(new { code = "InvalidSaveEnvelope",
                        message = "The save version is missing or invalid.", supportedVersion = CurrentSaveVersion });
                // A version above CurrentSaveVersion means the client is newer than this API build
                // (deploy drift — see the README's deployment notes); below 1 is simply invalid.
                if (number is < 1 or > CurrentSaveVersion)
                    return Results.BadRequest(new { code = "UnsupportedSaveVersion",
                        message = "This API does not support the submitted save format.", supportedVersion = CurrentSaveVersion });
                // The actual deep validation wall — see IsValidState below. Anything that fails here is
                // either a genuine client bug, a tampered request, or (most commonly during development)
                // this validation logic falling out of sync with a client-side game state change.
                if (!root.TryGetProperty("state", out var state) || !IsValidState(state, number))
                    return Results.BadRequest(new { code = "InvalidSaveState",
                        message = "The submitted run failed save validation.", supportedVersion = CurrentSaveVersion });

                try
                {
                    var save = await store.SaveAsync(ownerId, context.User.Identity!.Name!, state, number, context.RequestAborted,
                        expectedRevision, GoogleTokenAuthenticationHandler.IssuedAt(context.User));
                    return Results.Ok(new { save.SavedAt, save.EndlessUnlocked, save.RecoveredFromCorruptSave, save.Revision });
                }
                catch (SaveConflictException exception)
                {
                    return Results.Conflict(new { code = "SaveConflict", message = "The cloud save changed. Choose which save to keep before retrying.", revision = exception.Current?.Revision ?? 0 });
                }
                catch (AccountDeletedException)
                {
                    return Results.Unauthorized();
                }
                catch (JsonException exception)
                {
                    // The incoming request was valid JSON and passed all our validation, but something
                    // about serializing the storage envelope around it failed — this would indicate a
                    // bug in GameSaveStore rather than anything the client did wrong.
                    app.Logger.LogError(exception, "Save storage JSON processing failed for a validated format {Version} request; reference: {Reference}", number, context.TraceIdentifier);
                    return Results.Json(new { code = "SaveStorageJsonError", message = "The server could not process stored save JSON.", reference = context.TraceIdentifier }, statusCode: StatusCodes.Status500InternalServerError);
                }
                catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
                {
                    app.Logger.LogError(exception, "Save storage access failed for a validated format {Version} request; reference: {Reference}", number, context.TraceIdentifier);
                    return Results.Json(new { code = "SaveStorageUnavailable", message = "The server could not access save storage.", reference = context.TraceIdentifier }, statusCode: StatusCodes.Status500InternalServerError);
                }
            }
        }).RequireAuthorization().RequireRateLimiting("PlayerRequests");
    }

    public static bool TryParseRevision(string? value, out long revision)
    {
        revision = 0;
        return value is { Length: >= 3 and <= 21 } && value[0] == '"' && value[^1] == '"'
            && long.TryParse(value.AsSpan(1, value.Length - 2), System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture, out revision) && revision >= 0;
    }

    /// <summary>
    /// The heart of the save system's server-side trust boundary: deep-validates that a save
    /// state blob is actually plausible for the claimed version, rather than trusting the client
    /// blindly. This function is intentionally strict and version-gated (`if (version >= N)`
    /// branches throughout) so old and new save formats can both be validated correctly by the
    /// same API build during a transition period.
    ///
    /// Reading this method: each `if (version >= N) { ... }` block adds checks for fields that were
    /// introduced in save format N — earlier-format saves skip that block entirely rather than
    /// failing for "missing" fields that didn't exist yet in their format. When adding a new save
    /// field, add a new gated block here (see the JS runtime README's save-version-bump checklist)
    /// rather than making an existing check unconditional, or you'll break loading of every older save.
    /// </summary>
    private static bool IsValidState(JsonElement state, int version)
    {
        // Which forge-upgrade keys are expected depends on which patch introduced them — crit
        // stats arrived in v8, burst/guard skill upgrades in v9. Older saves simply don't have
        // (and shouldn't have) these keys, so the expected key set has to match the save's own version.
        string[] upgradeKeys = version >= 9
            ? ["weapon", "armor", "cleave", "nova", "dodge", "flask", "critChance", "critDamage", "burst", "guard"]
            : version >= 8
            ? ["weapon", "armor", "cleave", "nova", "dodge", "flask", "critChance", "critDamage"]
            : ["weapon", "armor", "cleave", "nova", "dodge", "flask"];
        string[] masteryKeys = version >= 8
            ? ["might", "vitality", "recovery", "area", "speed", "critChance", "critDamage"]
            : ["might", "vitality", "recovery"];
        // v5 introduced difficulty/ranking-mode tagging on the save itself. "legacy"/"legacy" is a
        // special pass-through pairing for saves that predate this tagging entirely and were
        // migrated forward without enough information to assign a real difficulty/mode.
        if (version >= 5 && (state.ValueKind != JsonValueKind.Object
            || !state.TryGetProperty("difficulty", out var difficulty) || difficulty.ValueKind != JsonValueKind.String
            || !state.TryGetProperty("rankingMode", out var rankingMode) || rankingMode.ValueKind != JsonValueKind.String
            || !(difficulty.GetString() == "legacy" && rankingMode.GetString() == "legacy"
                || ServiceDefaults.RankingRules.IsDifficulty(difficulty.GetString())
                    && (ServiceDefaults.RankingRules.IsMode(rankingMode.GetString())
                        || version >= 6 && rankingMode.GetString() == "legacy")))) return false;
        // Baseline structural checks common to every save version: the whole state tree must be
        // size/depth-bounded (see IsBounded), core scalar counters must be present and numeric, the
        // status must be a recognized value, and the player object must have all its core stats —
        // including a sane health/maxHealth relationship (alive, and not overhealed).
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
            return false;

        var wave = state.GetProperty("wave").GetDouble();
        // volleySequence tracks a running counter used to correlate enemy attack "volleys" with
        // the projectiles they fired (see ValidEnemyCombat below) — v14 feature, defaults to a
        // harmless placeholder for earlier saves that don't have the concept at all.
        long volleySequence = 2;
        if (version >= 14 && (!Numbers(state, "volleySequence") 
            || !state.GetProperty("volleySequence").TryGetInt64(out volleySequence) 
            || volleySequence < 2)) return false;
        // rankingPatch tags which patch produced this save/run, feeding the "pre004 vs 004" split
        // on the rankings leaderboard (see RankingRules.PatchName).
        if (version >= 13 && (!state.TryGetProperty("rankingPatch", out var rankingPatch)
            || rankingPatch.ValueKind != JsonValueKind.String
            || !ServiceDefaults.RankingRules.IsPatch(rankingPatch.GetString()))) return false;
        if (version >= 7)
        {
            // heroClass arrived in v7 alongside class-specific mechanics; only the Ranger class can
            // have in-flight playerShots (its ranged projectile skill), which is why `count != 0` is
            // only rejected for non-Ranger classes below.
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
            // scoreBaseline tracks the kill count at the point a difficulty/mode tag was assigned
            // (or the run started), so the leaderboard can compute a score delta rather than raw
            // lifetime kills for saves that migrated forward from an earlier, untagged format.
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
            // Forge upgrades only become meaningful once the player has spent at least one mastery
            // point (mastery training happens at the forge, unlocking forge upgrades) — if no
            // mastery has been spent, forge upgrades must be present at their exact starting values.
            if (total > 0 && (!state.TryGetProperty("upgrades", out var forge) || !Numbers(forge, upgradeKeys)
                || forge.EnumerateObject().Count() != upgradeKeys.Length
                || forge.EnumerateObject().Any(item => (version < 15 || item.Name is not ("nova" or "burst" or "guard"))
                    && item.Value.GetDouble() != (item.Name switch { "weapon" => 50, "armor" => 12, "flask" => 5, _ => 8 })))) return false;
        }
        var mode = "campaign";
        var completed = 0d;
        if (version >= 2)
        {
            // v2 introduced the campaign/endless mode split, the campaignComplete flag, and the
            // forge upgrade tracks (weapon/armor/etc.) with their own per-upgrade rank caps.
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

        // Cross-checks tying wave number, mode, and completion flag together: campaign runs can't
        // claim to be past wave 30, and endless runs can't exist without having actually finished
        // the campaign (wave >= 30 and campaignComplete == 1) first.
        if ((mode == "campaign" && wave > 30) || (mode == "endless" && (wave < 30 || completed != 1))) return false;
        if (version >= 6 && state.GetProperty("rankingMode").GetString() is ("ascended" or "endless") && mode != "endless") return false;
        // "camp" status (the between-waves rest/checkpoint screen) can only occur at a checkpoint
        // wave (multiple of 5) and never on the very last wave of whichever mode is active.
        if (status.GetString() == "camp" && (wave <= 0 || wave % 5 != 0 || (mode == "campaign" ? wave >= 30 : wave <= 30))) return false;
        if (status.GetString() == "won" && (mode != "campaign" || wave != 30 || completed != 1)) return false;
        // Both "resting at camp" and "won" imply the current wave's enemies have all been cleared.
        if (status.GetString() is "camp" or "won"
            && (!state.TryGetProperty("enemies", out var remaining) || remaining.ValueKind != JsonValueKind.Array || remaining.GetArrayLength() != 0)) return false;

        if (version >= 3)
        {
            // Timed buffs (fury/haste/ward/magnet) each have their own maximum remaining duration —
            // a duration above what the game could ever actually grant is a sign of tampering.
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

        // Every entity list (enemies/projectiles/loot) is validated per-item via ValidArray, which
        // also enforces the array's own size cap (128 entries) so a save can't smuggle in an
        // unbounded number of entities.
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

    /// <summary>
    /// Validates the level-up "boon" card system introduced in v4: how many points are banked into
    /// each boon track, how many card choices are currently pending, and (if any are pending) that
    /// the offered choices are a well-formed set of distinct, not-yet-maxed boon keys. The total
    /// spent across all boons plus any still-pending choices can never exceed one point per level
    /// gained (`level - 1`), which is the actual in-game rule for how boon points are earned.
    /// </summary>
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
            // "edge"/"vitality"/"fortune" are effectively uncapped (practically infinite scaling
            // boons); everything else caps at rank 10.
            var maximum = key is "edge" or "vitality" or "fortune" ? 9_007_199_254_740_991L : 10;
            if (!boons.GetProperty(key).TryGetInt64(out var rank) || rank < 0 || rank > maximum) return false;
            total += rank;
        }
        if (total > level - 1) return false;

        var offered = new HashSet<string>(StringComparer.Ordinal);
        foreach (var choice in choices.EnumerateArray())
        {
            // Offered choices must be distinct valid boon keys, and none of them can already be at
            // its own cap — the game would never actually offer a card for an already-maxed boon.
            if (choice.ValueKind != JsonValueKind.String || choice.GetString() is not { } key
                || !keys.Contains(key) || !offered.Add(key)) return false;
            var maximum = key is "edge" or "vitality" or "fortune" ? 9_007_199_254_740_991L : 10;
            if (boons.GetProperty(key).GetInt64() >= maximum) return false;
        }
        return true;
    }

    /// <summary>
    /// Validates the skill/loadout system introduced in v9: cooldown-ish per-skill counters, the
    /// current manual/auto skill loadout, and (v12+) the full per-class skill tree with its
    /// branch/node structure. The skill tree's shape genuinely depends on which skill you're
    /// looking at (attack/nova/burst/guard/dodge/potion each have their own 4 node keys as of v12),
    /// which is why <c>branchKeys</c> is computed per-skill inside the loop below.
    /// </summary>
    private static bool ValidSkillProgress(JsonElement state, JsonElement player, int version)
    {
        string[] skills = version >= 15
            ? ["attack", "nova", "burst", "guard", "dodge", "potion", "chain", "frost", "reap", "meteor", "siphon", "nullwave"]
            : ["attack", "nova", "burst", "guard", "dodge", "potion"];
        // v10 restricted auto-cast slots to only accept combat skills (nova/burst/guard) — before
        // that, any skill could theoretically be slotted into an auto slot.
        string[] slotSkills = version >= 15 ? ["nova", "burst", "guard", "chain", "frost", "reap", "meteor", "siphon", "nullwave"]
            : version >= 10 ? ["nova", "burst", "guard"] : skills;
        string[] nodes = ["potency", "reach", "ember", "recovery"];
        if (!Numbers(player, skills) || !Numbers(player, "guarding") || !Numbers(state, "resumeDelay", "travelPending")
            || state.GetProperty("resumeDelay").GetDouble() is < 0 or > 3
            || !state.GetProperty("travelPending").TryGetInt32(out var travel) || travel is < 0 or > 1
            || player.GetProperty("guarding").GetDouble() is < 0 or > 8
            || skills.Any(key => player.GetProperty(key).GetDouble() is < 0 or > 30)
            || !player.GetProperty("level").TryGetInt64(out var level) || level < 1
            || !state.TryGetProperty("loadout", out var loadout) || loadout.ValueKind != JsonValueKind.Object
            || !loadout.TryGetProperty("manual", out var manual) || manual.ValueKind != JsonValueKind.String || (version >= 15 ? manual.GetString() != "none" : !slotSkills.Contains(manual.GetString()))
            || !loadout.TryGetProperty("auto", out var auto) || auto.ValueKind != JsonValueKind.Array || auto.GetArrayLength() != (version >= 15 ? 4 : version >= 10 ? 2 : 3)
            || !state.TryGetProperty("skillTree", out var tree) || tree.ValueKind != JsonValueKind.Object || tree.EnumerateObject().Count() != skills.Length) return false;
        // A skill can only be slotted once total across manual+auto — same skill in two slots
        // simultaneously isn't a real loadout the game would ever produce.
        var slotted = new HashSet<string>(StringComparer.Ordinal) { manual.GetString()! };

        foreach (var item in auto.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String || item.GetString() is not { } key) return false;
            if (key != "none" && (!slotSkills.Contains(key) || !slotted.Add(key))) return false;
        }
        if (version >= 15)
        {
            var capacity = 1 + (level >= 5 ? 1 : 0) + (level >= 10 ? 1 : 0) + (level >= 15 ? 1 : 0);
            if (auto[0].GetString() == "none" || auto.EnumerateArray().Skip(capacity).Any(item => item.GetString() != "none")) return false;
        }
        if (version >= 11)
        {
            // Guard skill unlocks at a later wave in Endless mode than in campaign (wave 41 vs 11) —
            // this check makes sure a save can't claim the Guard skill is slotted/active before it
            // was actually unlockable for the run's current mode.
            if (!Numbers(state, "wardUnlockSeen") || !state.GetProperty("wardUnlockSeen").TryGetInt32(out var seen) || seen is < 0 or > 1) return false;
            var unlockWave = state.GetProperty("rankingMode").GetString() == "endless" ? 41 : 11;
            if (version < 15 && state.GetProperty("wave").GetDouble() < unlockWave && (slotted.Contains("guard") || player.GetProperty("guarding").GetDouble() != 0)) return false;
        }
        var spent = 0;

        foreach (var skill in skills)
        {
            // Pre-v12 saves all shared one generic 4-node shape; v12 gave every skill its own
            // distinctly-named branch (e.g. attack's nodes are edge/sweep/execution/rhythm).
            string[] branchKeys = version < 12 ? nodes : skill switch
            {
                "attack" => ["edge", "sweep", "execution", "rhythm"],
                "nova" => ["amplitude", "resonance", "ignition", "chill"],
                "burst" => ["focus", "aperture", "shatter", "overdrive"],
                "guard" => ["barrier", "duration", "repulse", "refuge"],
                "dodge" => ["agility", "distance", "afterstep", "recovery"],
                "potion" => ["concentration", "triage", "tonic", "renewal"],
                _ => nodes
            };
            if (!tree.TryGetProperty(skill, out var branch) || !Numbers(branch, branchKeys) || branch.EnumerateObject().Count() != branchKeys.Length) return false;
            
            for (var index = 0; index < branchKeys.Length; index++)
            {
                // Node 0 (the "root" of the branch) caps at rank 3; node 2 is a single-rank
                // keystone-style node; everything else caps at rank 2 — matches TREE_NODES in
                // arpg-skills.js.
                var maximum = index == 0 ? 3 : index == 2 ? 1 : 2;
                if (!branch.GetProperty(branchKeys[index]).TryGetInt32(out var rank) || rank < 0 || rank > maximum) return false;
                spent += rank;
            }
            // Prerequisite structure: the 2nd/3rd nodes require at least 1 point in the root node
            // first, and the 4th (capstone) node requires at least 1 point in either the 2nd or 3rd.
            if ((branch.GetProperty(branchKeys[1]).GetInt32() > 0 || branch.GetProperty(branchKeys[2]).GetInt32() > 0) && branch.GetProperty(branchKeys[0]).GetInt32() == 0) return false;
            if (branch.GetProperty(branchKeys[3]).GetInt32() > 0 && branch.GetProperty(branchKeys[1]).GetInt32() == 0 && branch.GetProperty(branchKeys[2]).GetInt32() == 0) return false;
        }
        if (version >= 12 && (!Numbers(player, "afterstep", "flaskWard", "renewal")
            || player.GetProperty("afterstep").GetDouble() is < 0 or > 1.2
            || player.GetProperty("flaskWard").GetDouble() is < 0 or > 2
            || player.GetProperty("renewal").GetDouble() is < 0 or > 2
            // These derived stats can only be non-zero if the tree node that grants them has
            // actually been spent into — otherwise a save could claim a buff the tree doesn't support.
            || player.GetProperty("afterstep").GetDouble() > 0 && tree.GetProperty("dodge").GetProperty("afterstep").GetInt32() == 0
            || player.GetProperty("flaskWard").GetDouble() > 0 && tree.GetProperty("potion").GetProperty("tonic").GetInt32() == 0
            || player.GetProperty("renewal").GetDouble() > 0 && tree.GetProperty("potion").GetProperty("renewal").GetInt32() == 0)) return false;
        // Total skill points spent across every tree can't exceed what the level should have earned
        // — one point per two levels (capped at 32) from v12 onward, or the older one-per-five (capped
        // at 12) rule for earlier saves.
        var pointBudget = version >= 12 ? Math.Min(32, level / 2) : Math.Min(12, level / 5);
        if (spent > pointBudget) return false;
        // "travelPending" represents the brief transition/travel screen between a checkpoint camp
        // and the next wave — only valid at a genuine checkpoint wave, with no enemies remaining,
        // and never claimed on the final campaign wave (there's nowhere left to travel to).
        if (travel == 1 && (state.GetProperty("resumeDelay").GetDouble() <= 0
            || state.GetProperty("wave").GetDouble() <= 0 || state.GetProperty("wave").GetDouble() % 5 != 0
            || state.GetProperty("status").GetString() is not ("playing" or "paused")
            || !state.TryGetProperty("enemies", out var enemies) || enemies.ValueKind != JsonValueKind.Array || enemies.GetArrayLength() != 0
            || state.GetProperty("mode").GetString() == "campaign" && state.GetProperty("wave").GetDouble() >= 30)) return false;
        return true;
    }

    /// <summary>
    /// Validates the v14 enemy "combat phase" state — which attack pattern phase/index a (possibly
    /// multi-phase boss) enemy is in, how long it's resting between attacks, and which numbered
    /// "volleys" of projectiles it has already fired (used to correlate enemy state with the
    /// projectiles list, see the playerShots volley check above for the equivalent on the player side).
    /// </summary>
    private static bool ValidEnemyCombat(JsonElement item, long sequence)
    {
        // Only bosses have multiple combat phases (up to 3); regular enemies are always phase 1.
        // "pattern" (which specific attack pattern is active) can't exceed the current phase number.
        if (!item.TryGetProperty("combat", out var combat) || !Numbers(combat, "phase", "rest", "pattern")
            || !combat.GetProperty("phase").TryGetInt32(out var phase) || phase < 1 || phase > (Kind(item, "boss") ? 3 : 1)
            || !combat.GetProperty("pattern").TryGetInt32(out var pattern) || pattern < 1 || pattern > phase
            // Only bosses get a rest/breather period between phases; regular enemies never rest.
            || combat.GetProperty("rest").GetDouble() < 0 || combat.GetProperty("rest").GetDouble() > (Kind(item, "boss") ? 2 : 0)
            // While resting, an enemy can't simultaneously be winding up an attack.
            || combat.GetProperty("rest").GetDouble() > 0 && (!Numbers(item, "attackWindup", "winding")
                || item.GetProperty("attackWindup").GetDouble() != 0 || item.GetProperty("winding").GetDouble() != 0)
            || !combat.TryGetProperty("volleys", out var volleys) || volleys.ValueKind != JsonValueKind.Array || volleys.GetArrayLength() > 48) return false;
        var seen = new HashSet<long>();

        foreach (var hit in volleys.EnumerateArray())
        {
            // Each recorded volley number must be unique per enemy (no firing the same volley
            // twice), within the overall run's volley sequence range, and represent a plausible
            // number of hits (1-3) for a single volley.
            if (!Numbers(hit, "volley", "hits") || !hit.GetProperty("volley").TryGetInt64(out var volley) || volley < 1 || volley > sequence || !seen.Add(volley)
                || !hit.GetProperty("hits").TryGetInt32(out var count) || count is < 1 or > 3) return false;
        }
        return true;
    }

    /// <summary>
    /// Validates the v13 elite-enemy modifier system: an enemy can carry one elite trait
    /// (armored/swift/mending) or none, but elite traits only start appearing from wave 11 onward
    /// and never apply to bosses (bosses already have their own scaling and multi-phase mechanics).
    /// </summary>
    private static bool ValidEliteModifier(JsonElement item, double wave) =>
        item.TryGetProperty("modifier", out var modifier) && modifier.ValueKind == JsonValueKind.String
        && modifier.GetString() is ("none" or "armored" or "swift" or "mending")
        && Numbers(item, "elite") && item.GetProperty("elite").TryGetInt32(out var elite) && elite is 0 or 1
        && (modifier.GetString() == "none" || elite == 1 && wave >= 11 && !Kind(item, "boss"));

    /// <summary>
    /// Checks that every named property on <paramref name="item"/> exists, is a JSON number, and is
    /// a finite value within a safe magnitude for round-tripping through JS's double-precision
    /// number type. This is the workhorse used throughout <see cref="IsValidState"/> to validate
    /// groups of numeric fields in one call instead of repeating the same TryGetProperty dance.
    /// </summary>
    private static bool Numbers(JsonElement item, params string[] names) =>
        item.ValueKind == JsonValueKind.Object && names.All(name =>
            item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number
            && value.TryGetDouble(out var number) && double.IsFinite(number) && Math.Abs(number) <= 9_007_199_254_740_991);

    /// <summary>Checks that <paramref name="item"/> has a "kind" string property matching one of the given values (e.g. an enemy type or loot type tag).</summary>
    private static bool Kind(JsonElement item, params string[] kinds) =>
        item.TryGetProperty("kind", out var kind) && kind.ValueKind == JsonValueKind.String && kinds.Contains(kind.GetString());

    /// <summary>
    /// Validates a named array property on <paramref name="state"/>: it must exist, be an array,
    /// stay within the 128-entry size cap (defends against unbounded-array payload bloat), and
    /// have every element pass the given per-item <paramref name="validate"/> predicate.
    /// </summary>
    private static bool ValidArray(JsonElement state, string name, Func<JsonElement, bool> validate) =>
        state.TryGetProperty(name, out var array) && array.ValueKind == JsonValueKind.Array
        && array.GetArrayLength() <= 128 && array.EnumerateArray().All(validate);

    /// <summary>
    /// Recursively checks that a JSON value (and everything nested inside it) stays within sane
    /// size/shape bounds: objects capped at 32 properties with short (&lt;=40 char) property names,
    /// arrays capped at 128 entries, strings capped at 200 characters, and numbers finite and of a
    /// safe magnitude. This is the first line of defense against a maliciously huge or deeply-varied
    /// save payload before any field-specific validation even runs — it deliberately rejects
    /// booleans/null outright since the save format never legitimately uses them (everything is
    /// represented as 0/1 numbers instead, see e.g. campaignComplete).
    /// </summary>
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
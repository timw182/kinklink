"""Seed the catalog_items table. Safe to run multiple times (skips if already seeded)."""
import asyncio
import aiosqlite
from database import DB_PATH, init_db

CATALOG = [
    # ── Connection ───────────────────────────────────────────────────────
    ("Slow Massage", "foreplay", "Full body, no rush. Let the tension melt away.", "🫶", "standard"),
    ("Hand Massage", "foreplay", "Just hands — palms, fingers, wrists. Surprisingly calming.", "🤲", "quick"),
    ("Scalp Massage", "foreplay", "Slow, firm fingers through the hair. Tension gone in minutes.", "💆", "quick"),
    ("Foot Rub", "foreplay", "End of a long day. Pressure points and patience.", "🦶", "quick"),
    ("Feather Touch", "foreplay", "Light fingertips across the arm and back. Goosebumps guaranteed.", "🪶", "quick"),
    ("Breathwork Together", "foreplay", "Sync your breathing. Sit close, eyes closed.", "🌬️", "quick"),
    ("Forehead to Forehead", "foreplay", "Lean in, close your eyes, just breathe.", "🧘", "quick"),
    ("Long Hug", "foreplay", "Twenty seconds or more. Let it actually land.", "🤗", "quick"),
    ("Eye Contact", "foreplay", "Sit facing each other. Hold eye contact for two minutes.", "👁️", "quick"),
    ("Slow Kissing", "foreplay", "No agenda. Just kissing for a while.", "💋", "quick"),
    ("Slow Dance", "foreplay", "One song, in the living room.", "💃", "quick"),
    ("Compliment Trade", "foreplay", "Three things you appreciate about each other. Out loud.", "💬", "quick"),
    ("Memory Lane", "foreplay", "Look through old photos together. Tell the stories.", "📸", "quick"),
    ("Cuddle Session", "foreplay", "No phones, no TV. Just close, on the couch.", "🛋️", "quick"),
    ("Hand-in-Hand Walk", "foreplay", "Walk somewhere together. Hands together the whole way.", "🚶", "quick"),
    ("Future Talk", "foreplay", "Where do we want to be in five years? Dream together.", "✨", "standard"),
    ("Gratitude Round", "foreplay", "Three things you're grateful for today. Each.", "🙏", "quick"),
    ("Foot Soak Together", "foreplay", "Two basins, warm water, salt. Sit and talk.", "🛁", "standard"),
    ("Star Gazing", "foreplay", "Outside, blanket, look up. Phones inside.", "🌌", "standard"),
    ("Tea Ritual", "foreplay", "Make tea slowly. Drink it side by side.", "🍵", "quick"),
    ("Dream Share", "foreplay", "Tell each other a dream you've never told anyone.", "💭", "quick"),
    ("Heart-to-Heart", "foreplay", "Share something you've been thinking about but haven't said.", "❤️", "standard"),
    ("Back Tracing", "foreplay", "Trace shapes on their back. They guess what.", "✍️", "quick"),
    ("Shoulder Knead", "foreplay", "Stand behind them. Work out the day's stress.", "🤲", "quick"),
    ("Twenty Questions", "foreplay", "Ask each other questions you've never asked before.", "❓", "standard"),

    # ── Together ─────────────────────────────────────────────────────────
    ("Spooning", "positions", "Intimate, close, lazy. Perfect for slow mornings.", "🥄", "quick"),
    ("Face to Face", "positions", "Foreheads close. Just talk in low voices.", "🫂", "quick"),
    ("Lap Pillow", "positions", "One lies down with head in the other's lap.", "💺", "quick"),
    ("Tangle of Legs", "positions", "Sit at opposite ends of the couch, legs intertwined.", "🦵", "quick"),
    ("Back to Back", "positions", "Sit back to back while you read or scroll. Lean in.", "🔄", "quick"),
    ("Standing Sway", "positions", "Long hug, gentle sway. Music optional.", "🤗", "quick"),
    ("Reading Together", "positions", "One leaning against the other, both with a book.", "📚", "standard"),
    ("Floor Picnic", "positions", "Rug, blankets, pillows. Eat on the floor.", "🧺", "quick"),
    ("Between the Knees", "positions", "Sit on the floor between their legs, lean back.", "🧎", "quick"),
    ("Shoulder Rest", "positions", "Head on their shoulder for a full movie.", "🛌", "quick"),
    ("Held from Behind", "positions", "Standing or sitting, arms wrapped from behind.", "🤲", "quick"),
    ("Knee to Knee", "positions", "Sit facing each other, knees touching. No phones.", "🪑", "quick"),
    ("Under One Blanket", "positions", "One big blanket, both of you inside.", "🛏️", "quick"),
    ("Side-Lying Talk", "positions", "Both on the bed, on your sides, facing each other.", "💬", "standard"),
    ("Linked-Arm Walk", "positions", "Walk side by side, arms linked, slow pace.", "🚶", "quick"),
    ("Hand to Sleep", "positions", "Hold hands as you drift off.", "🌙", "quick"),
    ("Hammock for Two", "positions", "If you have one — two people, gentle sway.", "🌴", "splurge"),
    ("Picnic Blanket", "positions", "One blanket outside. Lie down. Look at the sky.", "🧺", "standard"),
    ("Soak Together", "positions", "Sit in warm water side by side. No expectation.", "🛁", "standard"),
    ("Couch Sandwich", "positions", "One in front, one behind, both wrapped up.", "🛋️", "quick"),
    ("Eye-Level Sit", "positions", "Sit facing each other at eye level. Just talk.", "🪑", "quick"),
    ("On the Floor", "positions", "Beanbag, pillows, blanket-fort vibes.", "🔻", "quick"),
    ("Lap Sit", "positions", "Wrap arms around each other. Soft and close.", "🪜", "quick"),
    ("Bedside Talk", "positions", "Sit on the edge of the bed together. End the day in conversation.", "🛌", "quick"),
    ("Morning Stretch Together", "positions", "Both stretching side by side. Coffee after.", "☀️", "quick"),

    # ── Settings ─────────────────────────────────────────────────────────
    ("Slow Morning", "settings", "No alarm, no plans. Coffee in bed, slow start.", "☀️", "quick"),
    ("In the Dark", "settings", "Pitch black. Just voice and presence.", "🌑", "quick"),
    ("Hotel Stay", "settings", "Somewhere that isn't home. New bed, new energy.", "🏨", "splurge"),
    ("On the Couch", "settings", "Don't bother moving. Stay where you are.", "🛋️", "quick"),
    ("Bath Time", "settings", "Warm water, candle, no phones.", "🛁", "standard"),
    ("Outdoor Adventure", "settings", "Balcony, tent, secluded park. Open air.", "🌲", "splurge"),
    ("By Candlelight", "settings", "Flickering shadows, warm glow.", "🕯️", "quick"),
    ("After Date Night", "settings", "Dressed up, a little tipsy, hands held all evening.", "🥂", "standard"),
    ("Middle of the Night", "settings", "Half asleep, reaching for each other. Dreamy and unplanned.", "🌙", "quick"),
    ("In Front of a Mirror", "settings", "Stand and look at yourselves together.", "🪞", "standard"),
    ("Kitchen Time", "settings", "Cook together. Pour wine. No hurry.", "🍳", "quick"),
    ("Floor Picnic In", "settings", "Rug, blankets, pillows. Indoor picnic.", "🔻", "quick"),
    ("Rainy Day In", "settings", "Windows fogged, nowhere to be.", "🌧️", "quick"),
    ("Post-Workout Wind-Down", "settings", "Endorphins high. Cooldown together.", "💪", "quick"),
    ("Album Play", "settings", "Pick an album. Let it play start to finish.", "🎶", "quick"),
    ("Parked Quiet Spot", "settings", "Find a view. Sit in the car. Talk.", "🚗", "quick"),
    ("Weekend Away", "settings", "New place, no routine. Reset everything.", "🧳", "splurge"),
    ("Completely Phone-Free", "settings", "Both phones in another room. Two hours.", "📵", "quick"),
    ("Photo Day", "settings", "Take real photos of each other. Print favorites.", "📸", "standard"),
    ("Window Open", "settings", "Fresh air, breeze in. The room feels different.", "🪟", "quick"),
    ("Dress-Up Night In", "settings", "Both put on something nice. Dinner at home.", "👔", "splurge"),
    ("Coffee in Bed", "settings", "One brings the other coffee. Stay there an hour.", "☕", "quick"),
    ("Warm Light Night", "settings", "Soft warm bulb, low music, no overhead lights.", "🕯️", "splurge"),
    ("After the Argument", "settings", "Soften. Sit close. Talk slowly.", "🌩️", "quick"),
    ("Slow Dinner", "settings", "Eat over two hours. No phone, no TV. Just talk.", "🍷", "splurge"),

    # ── Themes ───────────────────────────────────────────────────────────
    ("Strangers Meet Again", "roleplay", "Pretend you don't know each other at a bar. Flirt from scratch.", "🍸", "standard"),
    ("Photo Shoot", "roleplay", "One poses, the other shoots. Make a real series.", "📸", "standard"),
    ("Decade Night", "roleplay", "Pick a decade. Dress, music, drinks all match.", "🎵", "splurge"),
    ("Tourists at Home", "roleplay", "Spend the day as visitors in your own city. Camera, map.", "🗺️", "standard"),
    ("Dare Game", "roleplay", "Take turns daring each other to small playful things.", "🎲", "standard"),
    ("Dress for Dinner", "roleplay", "Both pick an outfit you don't usually wear. Make it an occasion.", "🎀", "standard"),
    ("Written Notes", "roleplay", "Leave a note somewhere with a sweet message.", "✉️", "quick"),
    ("First Date Again", "roleplay", "Pretend it's the first date. Nervous, getting-to-know-you energy.", "🦋", "standard"),
    ("Costume Dinner", "roleplay", "Full commitment — outfit, character, voice. Stay in it.", "🎭", "splurge"),
    ("Memory Recreate", "roleplay", "Pick a time you both loved. Recreate it as closely as you can.", "📼", "standard"),
    ("Only Texting", "roleplay", "In the same house, only text each other. All night.", "💬", "quick"),
    ("Phone Call Date", "roleplay", "Different rooms. Long phone call, like long-distance.", "📞", "quick"),
    ("Cooking Show", "roleplay", "One is the host, one is the chef. Camera optional.", "📺", "standard"),
    ("Dinner Theatre", "roleplay", "Order in but make it a real event. Candles, music.", "🍽️", "standard"),
    ("Spy Mission", "roleplay", "Coded notes, secret meeting spot, low voices.", "🕵️", "standard"),
    ("Bold Confessions", "roleplay", "Tell each other the boldest thing you've done in the last year.", "📿", "quick"),
    ("Time Capsule", "roleplay", "Write letters to your future selves. Seal them.", "📜", "standard"),
    ("Therapist Hour", "roleplay", "One asks deep questions, one answers. Switch.", "🧠", "standard"),
    ("Interview Each Other", "roleplay", "Twenty questions you'd ask a stranger. Now ask each other.", "🎤", "quick"),
    ("Painting Session", "roleplay", "Paint each other from across the room. Bad art encouraged.", "🎨", "standard"),
    ("Build a Playlist", "roleplay", "Make a playlist of songs that remind you of each other.", "🎶", "standard"),
    ("Story Building", "roleplay", "Make up a story together, one sentence at a time.", "📖", "quick"),
    ("Accent Night", "roleplay", "Pick an accent. Stay in it the whole dinner.", "🗣️", "quick"),
    ("Vow Renewal", "roleplay", "Write each other new vows or promises. Read them aloud.", "💍", "splurge"),
    ("Handwritten Letter", "roleplay", "Write a love letter by hand. Read them out loud together.", "✉️", "standard"),

    # ── Extras ───────────────────────────────────────────────────────────
    ("Massage Oil", "toys-gear", "Scented, warming. Makes everything glide.", "🫧", "quick"),
    ("Silk Sheets", "toys-gear", "Switch your sheets out for the night. Feels luxurious.", "🧣", "splurge"),
    ("Candles Everywhere", "toys-gear", "Many candles, no other lights. Set the room.", "🕯️", "standard"),
    ("Bubble Bath", "toys-gear", "Bubbles, salt, oils. Set the whole bathroom up.", "🛁", "standard"),
    ("Hot Chocolate Setup", "toys-gear", "Real hot chocolate, marshmallows, blanket.", "☕", "quick"),
    ("Music System", "toys-gear", "Speaker, playlist, room set up for it.", "🎶", "standard"),
    ("Fresh Flowers", "toys-gear", "Bouquet, vase, well-lit corner.", "💐", "standard"),
    ("Matching Robes", "toys-gear", "Both wrap up in matching robes. Cozy night in.", "🥼", "splurge"),
    ("Eye Masks", "toys-gear", "Both wear silk eye masks. Sleep in.", "🖤", "quick"),
    ("Aroma Diffuser", "toys-gear", "Lavender, vanilla, sandalwood. Set the mood.", "🌿", "standard"),
    ("Photo Album", "toys-gear", "Print recent photos. Make a real album together.", "📸", "splurge"),
    ("Scented Lotion", "toys-gear", "After a shower, slow application by the other.", "🌸", "quick"),
    ("Warm Compress", "toys-gear", "Hot towel, microwaved. Across shoulders or back.", "♨️", "quick"),
    ("Polaroid Camera", "toys-gear", "Take real photos. Keep them somewhere safe.", "📷", "splurge"),
    ("Vinyl Record", "toys-gear", "Pick a record. Play it side A to side B.", "📀", "splurge"),
    ("Star Projector", "toys-gear", "Stars on the ceiling. Lie back and watch.", "🌌", "splurge"),
    ("Aromatherapy Set", "toys-gear", "Three scents. Pick one for the night.", "🪷", "standard"),
    ("Heated Blanket", "toys-gear", "Plug it in early. Get under it together.", "🛌", "standard"),
    ("Tea Set", "toys-gear", "Proper teapot, two cups. Make a ritual of it.", "🍵", "standard"),
    ("Picnic Basket", "toys-gear", "Pack one for two. Take it somewhere quiet.", "🧺", "splurge"),

    # ── Adventurous ──────────────────────────────────────────────────────
    ("New Hobby Night", "adventurous", "Pick something neither of you has done. Try it together.", "🎨", "standard"),
    ("Cook Something New", "adventurous", "A cuisine neither of you has cooked. Recipe + ingredients.", "🍳", "standard"),
    ("Map Pin Date", "adventurous", "Drop a random pin within 50 miles. Drive there.", "📍", "splurge"),
    ("Language Hour", "adventurous", "Both learn five phrases in a new language. Use them.", "🗣️", "quick"),
    ("Dance Class At Home", "adventurous", "YouTube tutorial. Pick a style. Be bad at it.", "💃", "standard"),
    ("Sunrise Together", "adventurous", "Set the alarm for an actual sunrise. Coffee outside.", "🌅", "standard"),
    ("Pantry Cooking", "adventurous", "Make dinner with only what's in the kitchen.", "🥘", "quick"),
    ("Camping In", "adventurous", "Tent in the living room. Real sleeping bags.", "⛺", "standard"),
    ("Camping Out", "adventurous", "Real tent, real outdoors. Bring everything.", "🏕️", "splurge"),
    ("Surprise Drive", "adventurous", "One person plans the route. The other has no idea where.", "🚗", "standard"),
    ("Stargazing Trip", "adventurous", "Drive somewhere with no light pollution. Blanket, telescope.", "🔭", "splurge"),
    ("Try a Class", "adventurous", "Pottery, cocktails, painting — book a class together.", "🎓", "splurge"),
    ("Restaurant Roulette", "adventurous", "List, dart, eat. Trust the universe.", "🎯", "splurge"),
    ("New Neighborhood", "adventurous", "Walk through a part of the city you've never been to.", "🚶", "quick"),
    ("Concert Together", "adventurous", "Pick something neither would normally go to.", "🎤", "splurge"),
    ("Live Music Night", "adventurous", "Find a local venue. Show up, no plan after.", "🎸", "splurge"),
    ("Day Off Together", "adventurous", "Take a Tuesday off. Spend it like a weekend.", "📅", "splurge"),
    ("Hike Somewhere New", "adventurous", "Trail neither of you has done. Pack snacks.", "🥾", "splurge"),
    ("Recipe Swap", "adventurous", "Each cook for the other something they've never made.", "👩‍🍳", "standard"),
    ("Bookstore Browse", "adventurous", "Two hours, no agenda. Buy each other a book.", "📚", "standard"),
    ("Game Night Just Us", "adventurous", "Board game, dice, cards. Phones in another room.", "🎲", "quick"),
    ("Day at the Spa", "adventurous", "Side-by-side massages, sauna, no phones.", "💆", "splurge"),
    ("Cocktail Crafting", "adventurous", "Make three new cocktails. Rate them.", "🍸", "standard"),
    ("Pottery Together", "adventurous", "Take a class. Make each other a mug.", "🏺", "splurge"),
    ("Road Trip Day", "adventurous", "One tank of gas. Go in whatever direction.", "🛣️", "splurge"),
]


async def seed():
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM catalog_items")
        row = await cursor.fetchone()
        if row and row[0] > 0:
            print(f"Catalog already has {row[0]} items — skipping seed.")
            return

        await db.executemany(
            "INSERT INTO catalog_items (title, category, description, emoji, tier) VALUES (?,?,?,?,?)",
            CATALOG,
        )
        await db.commit()
        print(f"Seeded {len(CATALOG)} catalog items.")


if __name__ == "__main__":
    asyncio.run(seed())

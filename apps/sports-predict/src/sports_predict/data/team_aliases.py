"""Team aliases for improved searchability.

This module provides aliases (acronyms, nicknames, locations, mascots) for teams
across all supported leagues to improve search functionality.
"""

from typing import Dict, List, Set

# NCAA Basketball team aliases
# Maps team_id or team_name patterns to list of searchable aliases
NCAAB_ALIASES: Dict[str, List[str]] = {
    # ACC
    "duke": ["Blue Devils", "Dukies", "Coach K", "Durham"],
    "north-carolina": ["UNC", "Tar Heels", "Tarheels", "Carolina", "Chapel Hill"],
    "nc-state": ["NC State", "NCSU", "Wolfpack", "North Carolina State", "Raleigh"],
    "wake-forest": ["Wake", "Demon Deacons", "Deacs", "Winston-Salem"],
    "virginia": ["UVA", "Cavaliers", "Cavs", "Wahoos", "Charlottesville"],
    "virginia-tech": ["VT", "Hokies", "Virginia Tech", "Blacksburg"],
    "clemson": ["Tigers", "Death Valley"],
    "florida-state": ["FSU", "Seminoles", "Noles", "Tallahassee"],
    "georgia-tech": ["GT", "Yellow Jackets", "Ramblin Wreck", "Atlanta"],
    "louisville": ["Cards", "Cardinals", "UofL"],
    "miami-fl": ["Miami", "Hurricanes", "Canes", "The U", "Coral Gables"],
    "boston-college": ["BC", "Eagles"],
    "pittsburgh": ["Pitt", "Panthers"],
    "syracuse": ["Cuse", "Orange", "Orangemen"],
    "notre-dame": ["ND", "Irish", "Fighting Irish", "South Bend"],

    # Big Ten
    "michigan": ["Wolverines", "U of M", "Ann Arbor", "Go Blue"],
    "michigan-state": ["MSU", "Spartans", "Sparty", "East Lansing"],
    "ohio-state": ["OSU", "Buckeyes", "Columbus", "tOSU"],
    "indiana": ["IU", "Hoosiers", "Bloomington"],
    "purdue": ["Boilermakers", "Boilers", "West Lafayette"],
    "illinois": ["Illini", "Fighting Illini", "Champaign", "UIUC"],
    "iowa": ["Hawkeyes", "Iowa City"],
    "wisconsin": ["Badgers", "Bucky", "Madison"],
    "minnesota": ["Gophers", "Golden Gophers", "Minneapolis"],
    "northwestern": ["Wildcats", "Evanston"],
    "penn-state": ["PSU", "Nittany Lions", "State College"],
    "nebraska": ["Huskers", "Cornhuskers", "Lincoln"],
    "maryland": ["Terps", "Terrapins", "College Park"],
    "rutgers": ["Scarlet Knights", "New Brunswick"],
    "ucla": ["UCLA", "Bruins", "Westwood", "Los Angeles"],
    "usc": ["USC", "Trojans", "Southern Cal", "Los Angeles"],
    "oregon": ["Ducks", "Eugene"],
    "washington": ["UW", "Huskies", "Seattle"],

    # Big 12
    "kansas": ["KU", "Jayhawks", "Rock Chalk", "Lawrence"],
    "kansas-state": ["K-State", "KSU", "Wildcats", "Manhattan"],
    "texas": ["UT", "Longhorns", "Horns", "Austin", "Hook Em"],
    "texas-tech": ["TTU", "Red Raiders", "Lubbock"],
    "baylor": ["Bears", "Waco"],
    "oklahoma": ["OU", "Sooners", "Boomer Sooner", "Norman"],
    "oklahoma-state": ["OSU", "Cowboys", "Pokes", "Stillwater"],
    "west-virginia": ["WVU", "Mountaineers", "Morgantown"],
    "iowa-state": ["ISU", "Cyclones", "Ames"],
    "tcu": ["TCU", "Horned Frogs", "Texas Christian", "Fort Worth"],
    "cincinnati": ["UC", "Bearcats", "Cincy"],
    "houston": ["UH", "Cougars", "Coogs"],
    "ucf": ["UCF", "Knights", "Central Florida", "Orlando"],
    "brigham-young": ["BYU", "Cougars", "Brigham Young", "Provo"],

    # SEC
    "kentucky": ["UK", "Wildcats", "Cats", "Big Blue Nation", "Lexington"],
    "tennessee": ["UT", "Vols", "Volunteers", "Knoxville", "Rocky Top"],
    "florida": ["UF", "Gators", "Gainesville"],
    "georgia": ["UGA", "Bulldogs", "Dawgs", "Athens"],
    "alabama": ["Bama", "Crimson Tide", "Roll Tide", "Tuscaloosa"],
    "auburn": ["Tigers", "War Eagle", "Plains"],
    "arkansas": ["Hogs", "Razorbacks", "Fayetteville", "Woo Pig"],
    "lsu": ["LSU", "Tigers", "Geaux Tigers", "Baton Rouge"],
    "mississippi-state": ["Miss State", "MSU", "Bulldogs", "Starkville"],
    "ole-miss": ["Ole Miss", "Rebels", "Mississippi", "Oxford", "Hotty Toddy"],
    "south-carolina": ["USC", "Gamecocks", "Carolina", "Columbia"],
    "vanderbilt": ["Vandy", "Commodores", "Dores", "Nashville"],
    "missouri": ["Mizzou", "MU", "Tigers", "Columbia"],
    "texas-am": ["Texas A&M", "TAMU", "Aggies", "College Station", "Gig Em"],

    # Big East
    "uconn": ["UConn", "Connecticut", "Huskies", "Storrs"],
    "villanova": ["Nova", "Wildcats", "Philly"],
    "georgetown": ["Hoyas", "DC", "Washington"],
    "marquette": ["Golden Eagles", "Milwaukee"],
    "providence": ["Friars", "PC"],
    "st-johns": ["St. John's", "Red Storm", "Johnnies", "Queens", "NYC"],
    "xavier": ["Musketeers", "X", "Cincinnati"],
    "seton-hall": ["Pirates", "The Hall", "Newark"],
    "creighton": ["Bluejays", "Jays", "Omaha"],
    "butler": ["Bulldogs", "Indianapolis"],
    "depaul": ["Blue Demons", "Chicago"],

    # Pac-12 / West
    "arizona": ["UA", "Wildcats", "Cats", "Tucson", "Bear Down"],
    "arizona-state": ["ASU", "Sun Devils", "Tempe", "Fork Em"],
    "colorado": ["CU", "Buffs", "Buffaloes", "Boulder"],
    "utah": ["Utes", "Salt Lake City"],
    "stanford": ["Cardinal", "Palo Alto"],
    "california": ["Cal", "Golden Bears", "Berkeley"],
    "oregon-state": ["OSU", "Beavers", "Corvallis"],
    "washington-state": ["Wazzu", "WSU", "Cougars", "Pullman"],

    # Mid-Majors with tournament success
    "gonzaga": ["Zags", "Bulldogs", "Spokane"],
    "saint-marys-ca": ["Saint Mary's", "SMC", "Gaels", "Moraga"],
    "san-diego-state": ["SDSU", "Aztecs", "San Diego"],
    "memphis": ["Tigers", "U of M"],
    "wichita-state": ["Shockers", "Wichita"],
    "dayton": ["Flyers", "UD"],
    "vcu": ["VCU", "Rams", "Virginia Commonwealth", "Richmond"],
    "loyola-chicago": ["Ramblers", "Loyola", "Sister Jean"],
    "davidson": ["Wildcats"],
    "murray-state": ["Racers"],
    "south-dakota-state": ["SDSU", "Jackrabbits"],
    "new-mexico-state": ["NMSU", "Aggies", "Las Cruces"],
    "unc-wilmington": ["UNCW", "Seahawks"],
    "unc-asheville": ["UNCA", "Bulldogs"],
    "unc-greensboro": ["UNCG", "Spartans"],
    "southern-methodist": ["SMU", "Mustangs", "Ponies", "Dallas"],
    "tulsa": ["Golden Hurricane"],
    "tulane": ["Green Wave", "New Orleans"],
    "rice": ["Owls", "Houston"],
    "north-texas": ["UNT", "Mean Green", "Denton"],
    "texas-san-antonio": ["UTSA", "Roadrunners", "San Antonio"],
    "texas-el-paso": ["UTEP", "Miners", "El Paso"],
    "nevada-las-vegas": ["UNLV", "Rebels", "Runnin Rebels", "Vegas"],
    "nevada": ["Wolf Pack", "Reno"],
    "fresno-state": ["Bulldogs", "Fresno"],
    "san-jose-state": ["SJSU", "Spartans", "San Jose"],
    "new-mexico": ["UNM", "Lobos", "Albuquerque"],
    "colorado-state": ["CSU", "Rams", "Fort Collins"],
    "boise-state": ["BSU", "Broncos", "Boise"],
    "air-force": ["Falcons", "AFA", "Colorado Springs"],
    "wyoming": ["Cowboys", "Pokes", "Laramie"],
}

# NFL team aliases
NFL_ALIASES: Dict[str, List[str]] = {
    # AFC East
    "buf": ["Buffalo", "Bills", "Mafia", "Josh Allen"],
    "mia": ["Miami", "Dolphins", "Fins", "Tua"],
    "ne": ["New England", "Patriots", "Pats", "Boston", "Foxborough"],
    "nyj": ["New York Jets", "Jets", "Gang Green", "Meadowlands"],

    # AFC North
    "bal": ["Baltimore", "Ravens", "Charm City", "Lamar"],
    "cin": ["Cincinnati", "Bengals", "Cincy", "Who Dey", "Burrow"],
    "cle": ["Cleveland", "Browns", "Dawg Pound"],
    "pit": ["Pittsburgh", "Steelers", "Steel City", "Terrible Towel"],

    # AFC South
    "hou": ["Houston", "Texans", "H-Town", "Stroud"],
    "ind": ["Indianapolis", "Colts", "Indy"],
    "jax": ["Jacksonville", "Jaguars", "Jags", "Duval"],
    "ten": ["Tennessee", "Titans", "Nashville", "Smashville"],

    # AFC West
    "den": ["Denver", "Broncos", "Mile High"],
    "kc": ["Kansas City", "Chiefs", "KC", "Mahomes", "Arrowhead"],
    "lv": ["Las Vegas", "Raiders", "Vegas", "Silver and Black", "Oakland"],
    "lac": ["Los Angeles Chargers", "Chargers", "LA Chargers", "Bolts", "Herbert"],

    # NFC East
    "dal": ["Dallas", "Cowboys", "Americas Team", "Big D", "Jerry"],
    "nyg": ["New York Giants", "Giants", "Big Blue", "Meadowlands"],
    "phi": ["Philadelphia", "Eagles", "Philly", "Birds", "Fly Eagles Fly"],
    "was": ["Washington", "Commanders", "DC", "Hogs", "Skins"],

    # NFC North
    "chi": ["Chicago", "Bears", "Monsters of the Midway", "Da Bears"],
    "det": ["Detroit", "Lions", "Motor City", "Honolulu Blue"],
    "gb": ["Green Bay", "Packers", "Pack", "Lambeau", "Titletown", "Rodgers"],
    "min": ["Minnesota", "Vikings", "Skol", "Minneapolis", "Purple People Eaters"],

    # NFC South
    "atl": ["Atlanta", "Falcons", "Dirty Birds", "ATL"],
    "car": ["Carolina", "Panthers", "Charlotte", "Keep Pounding"],
    "no": ["New Orleans", "Saints", "NOLA", "Who Dat", "Superdome"],
    "tb": ["Tampa Bay", "Buccaneers", "Bucs", "Tampa", "Pewter"],

    # NFC West
    "ari": ["Arizona", "Cardinals", "Cards", "Phoenix", "Desert"],
    "lar": ["Los Angeles Rams", "Rams", "LA Rams"],
    "sf": ["San Francisco", "49ers", "Niners", "SF", "Bay Area", "Faithful"],
    "sea": ["Seattle", "Seahawks", "Hawks", "12th Man", "Pacific Northwest"],
}

# NCAA Football team aliases (similar to basketball but with football-specific terms)
# Keys are ESPN abbreviations (lowercase) to match how team_id is stored by espn_scraper
NCAAF_ALIASES: Dict[str, List[str]] = {
    # SEC
    "ala": ["Alabama", "Bama", "Crimson Tide", "Roll Tide", "Tuscaloosa", "Saban"],
    "aub": ["Auburn", "Tigers", "War Eagle", "Plains", "Jordan Hare"],
    "fla": ["Florida", "Gators", "UF", "Gainesville", "Swamp"],
    "uga": ["Georgia", "Bulldogs", "Dawgs", "UGA", "Athens", "Between the Hedges"],
    "lsu": ["LSU", "Tigers", "Geaux Tigers", "Baton Rouge", "Death Valley"],
    "miss": ["Ole Miss", "Rebels", "Mississippi", "Oxford", "Hotty Toddy", "Grove"],
    "msst": ["Mississippi State", "Bulldogs", "MSU", "State", "Starkville", "Cowbells"],
    "ta&m": ["Texas A&M", "Aggies", "TAMU", "College Station", "Gig Em", "12th Man"],
    "tenn": ["Tennessee", "Vols", "Volunteers", "UT", "Knoxville", "Rocky Top", "Neyland"],
    "ark": ["Arkansas", "Razorbacks", "Hogs", "Woo Pig", "Fayetteville"],
    "uk": ["Kentucky", "Wildcats", "UK", "Lexington"],
    "van": ["Vanderbilt", "Commodores", "Vandy", "Nashville"],
    "miz": ["Missouri", "Tigers", "Mizzou", "Columbia"],

    # Big Ten
    "mich": ["Michigan", "Wolverines", "Big House", "Ann Arbor", "Go Blue", "Maize and Blue"],
    "msu": ["Michigan State", "Spartans", "MSU", "Sparty", "East Lansing"],
    "osu": ["Ohio State", "Buckeyes", "OSU", "tOSU", "Columbus", "Horseshoe", "Script Ohio"],
    "psu": ["Penn State", "Nittany Lions", "PSU", "State College", "Happy Valley", "We Are"],
    "wis": ["Wisconsin", "Badgers", "Bucky", "Madison", "Jump Around"],
    "iowa": ["Iowa", "Hawkeyes", "Iowa City", "Kinnick"],
    "minn": ["Minnesota", "Golden Gophers", "Gophers", "Minneapolis", "Ski-U-Mah"],
    "ill": ["Illinois", "Fighting Illini", "Illini", "Champaign"],
    "pur": ["Purdue", "Boilermakers", "Boilers", "West Lafayette"],
    "neb": ["Nebraska", "Cornhuskers", "Huskers", "Lincoln", "GBR"],
    "iu": ["Indiana", "Hoosiers", "IU", "Bloomington"],
    "rutg": ["Rutgers", "Scarlet Knights", "New Brunswick"],
    "md": ["Maryland", "Terrapins", "Terps", "College Park"],
    "nu": ["Northwestern", "Wildcats", "Evanston"],
    "usc": ["USC", "Trojans", "Southern Cal", "Fight On", "Los Angeles"],
    "ucla": ["UCLA", "Bruins", "Westwood", "Los Angeles"],
    "ore": ["Oregon", "Ducks", "Eugene", "Autzen"],
    "wash": ["Washington", "Huskies", "UW", "Seattle", "Dawgs"],

    # Big 12
    "tex": ["Texas", "Longhorns", "UT", "Austin", "Hook Em", "Horns"],
    "ttu": ["Texas Tech", "Red Raiders", "TTU", "Lubbock", "Guns Up"],
    "ou": ["Oklahoma", "Sooners", "OU", "Norman", "Boomer Sooner"],
    "okst": ["Oklahoma State", "Cowboys", "OSU", "Pokes", "Stillwater"],
    "bay": ["Baylor", "Bears", "Waco", "Sic Em"],
    "tcu": ["TCU", "Horned Frogs", "Texas Christian", "Fort Worth"],
    "isu": ["Iowa State", "Cyclones", "ISU", "Ames"],
    "ksu": ["Kansas State", "Wildcats", "K-State", "KSU", "Manhattan"],
    "ku": ["Kansas", "Jayhawks", "KU", "Rock Chalk", "Lawrence"],
    "wvu": ["West Virginia", "Mountaineers", "WVU", "Morgantown"],
    "cin": ["Cincinnati", "Bearcats", "UC", "Cincy"],
    "hou": ["Houston", "Cougars", "UH", "Coogs"],
    "ucf": ["UCF", "Knights", "Central Florida", "Orlando", "Bounce House"],
    "byu": ["BYU", "Cougars", "Brigham Young", "Provo"],
    "colo": ["Colorado", "Buffaloes", "Buffs", "CU", "Boulder", "Deion"],
    "asu": ["Arizona State", "Sun Devils", "ASU", "Tempe", "Fork Em"],
    "ariz": ["Arizona", "Wildcats", "UA", "Tucson", "Bear Down"],
    "utah": ["Utah", "Utes", "Salt Lake City", "MUSS"],

    # ACC
    "clem": ["Clemson", "Tigers", "Death Valley", "All In"],
    "fsu": ["Florida State", "Seminoles", "FSU", "Noles", "Tallahassee"],
    "mia": ["Miami", "Hurricanes", "Canes", "The U", "Turnover Chain"],
    "gt": ["Georgia Tech", "Yellow Jackets", "GT", "Atlanta", "Ramblin Wreck"],
    "lou": ["Louisville", "Cardinals", "Cards", "UofL"],
    "ncsu": ["NC State", "Wolfpack", "NCSU", "North Carolina State", "Raleigh"],
    "unc": ["North Carolina", "Tar Heels", "UNC", "Chapel Hill", "Tarheels"],
    "duke": ["Duke", "Blue Devils", "Durham"],
    "uva": ["Virginia", "Cavaliers", "UVA", "Wahoos", "Charlottesville"],
    "vt": ["Virginia Tech", "Hokies", "VT", "Blacksburg", "Enter Sandman"],
    "pitt": ["Pittsburgh", "Panthers", "Pitt"],
    "syr": ["Syracuse", "Orange", "Cuse"],
    "bc": ["Boston College", "Eagles", "BC"],
    "wake": ["Wake Forest", "Demon Deacons", "Wake", "Deacs"],
    "nd": ["Notre Dame", "Fighting Irish", "ND", "Irish", "South Bend", "Touchdown Jesus"],
    "stan": ["Stanford", "Cardinal", "Palo Alto", "Farm"],
    "cal": ["California", "Golden Bears", "Cal", "Berkeley"],
    "smu": ["SMU", "Mustangs", "Southern Methodist", "Ponies", "Dallas"],

    # Other notable programs
    "bois": ["Boise State", "Broncos", "BSU", "Boise", "Blue Turf", "Smurf Turf"],
}


def get_aliases_for_league(league_value: str) -> Dict[str, List[str]]:
    """Get the aliases dictionary for a league.

    Args:
        league_value: The league value (e.g., 'ncaab', 'nfl', 'ncaaf')

    Returns:
        Dict mapping team identifiers to lists of aliases
    """
    if league_value == "ncaab":
        return NCAAB_ALIASES
    elif league_value == "nfl":
        return NFL_ALIASES
    elif league_value == "ncaaf":
        return NCAAF_ALIASES
    return {}


def get_team_search_terms(team_id: str, team_name: str, league_value: str) -> Set[str]:
    """Get all searchable terms for a team.

    Args:
        team_id: The team's ID
        team_name: The team's display name
        league_value: The league value

    Returns:
        Set of all searchable terms (name, id, aliases)
    """
    terms = {team_name, team_id}

    aliases_dict = get_aliases_for_league(league_value)

    # Check for aliases by team_id
    if team_id.lower() in aliases_dict:
        terms.update(aliases_dict[team_id.lower()])

    # Also check with dashes replaced by other common patterns
    team_id_normalized = team_id.lower().replace("-", " ").replace("_", " ")
    for key, aliases in aliases_dict.items():
        key_normalized = key.lower().replace("-", " ").replace("_", " ")
        if key_normalized == team_id_normalized:
            terms.update(aliases)
            break

    # Check if team_name matches any alias key patterns
    team_name_lower = team_name.lower()
    for key, aliases in aliases_dict.items():
        # Check if the key is contained in the team name
        key_clean = key.replace("-", " ")
        if key_clean in team_name_lower or team_name_lower in key_clean:
            terms.update(aliases)

    return terms


def format_team_display_with_aliases(team_id: str, team_name: str, league_value: str) -> str:
    """Format a team name with key aliases for display.

    Args:
        team_id: The team's ID
        team_name: The team's display name
        league_value: The league value

    Returns:
        Display string like "Duke Blue Devils" or "SMU (Southern Methodist)"
    """
    aliases_dict = get_aliases_for_league(league_value)

    # Find aliases for this team
    team_aliases = []
    team_id_lower = team_id.lower()

    if team_id_lower in aliases_dict:
        team_aliases = aliases_dict[team_id_lower]
    else:
        # Try normalized matching
        team_id_normalized = team_id_lower.replace("-", " ").replace("_", " ")
        for key, aliases in aliases_dict.items():
            key_normalized = key.lower().replace("-", " ").replace("_", " ")
            if key_normalized == team_id_normalized:
                team_aliases = aliases
                break

    # If we have aliases, add the most relevant ones
    if team_aliases:
        # Filter to acronyms/nicknames (short ones that aren't already in the name)
        acronyms = [a for a in team_aliases if len(a) <= 5 and a.upper() not in team_name.upper()]
        if acronyms:
            return f"{team_name} ({acronyms[0]})"

    return team_name

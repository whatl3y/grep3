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
NCAAF_ALIASES: Dict[str, List[str]] = {
    # SEC
    "1": ["Alabama", "Bama", "Crimson Tide", "Roll Tide", "Tuscaloosa", "Saban"],
    "2": ["Auburn", "Tigers", "War Eagle", "Plains", "Jordan Hare"],
    "57": ["Florida", "Gators", "UF", "Gainesville", "Swamp"],
    "61": ["Georgia", "Bulldogs", "Dawgs", "UGA", "Athens", "Between the Hedges"],
    "96": ["LSU", "Tigers", "Geaux Tigers", "Baton Rouge", "Death Valley"],
    "145": ["Ole Miss", "Rebels", "Mississippi", "Oxford", "Hotty Toddy", "Grove"],
    "344": ["Mississippi State", "Bulldogs", "MSU", "State", "Starkville", "Cowbells"],
    "2633": ["Texas A&M", "Aggies", "TAMU", "College Station", "Gig Em", "12th Man"],
    "2653": ["Tennessee", "Vols", "Volunteers", "UT", "Knoxville", "Rocky Top", "Neyland"],
    "8": ["Arkansas", "Razorbacks", "Hogs", "Woo Pig", "Fayetteville"],
    "41": ["South Carolina", "Gamecocks", "USC", "Columbia", "Williams-Brice"],
    "97": ["Kentucky", "Wildcats", "UK", "Lexington"],
    "238": ["Missouri", "Tigers", "Mizzou", "Columbia"],
    "2633": ["Vanderbilt", "Commodores", "Vandy", "Nashville"],

    # Big Ten
    "130": ["Michigan", "Wolverines", "Big House", "Ann Arbor", "Go Blue", "Maize and Blue"],
    "127": ["Michigan State", "Spartans", "MSU", "Sparty", "East Lansing"],
    "194": ["Ohio State", "Buckeyes", "OSU", "tOSU", "Columbus", "Horseshoe", "Script Ohio"],
    "2509": ["Penn State", "Nittany Lions", "PSU", "State College", "Happy Valley", "We Are"],
    "356": ["Wisconsin", "Badgers", "Bucky", "Madison", "Jump Around"],
    "84": ["Iowa", "Hawkeyes", "Iowa City", "Kinnick"],
    "135": ["Minnesota", "Golden Gophers", "Gophers", "Minneapolis", "Ski-U-Mah"],
    "77": ["Illinois", "Fighting Illini", "Illini", "Champaign"],
    "259": ["Purdue", "Boilermakers", "Boilers", "West Lafayette"],
    "158": ["Nebraska", "Cornhuskers", "Huskers", "Lincoln", "GBR"],
    "87": ["Indiana", "Hoosiers", "IU", "Bloomington"],
    "275": ["Rutgers", "Scarlet Knights", "New Brunswick"],
    "120": ["Maryland", "Terrapins", "Terps", "College Park"],
    "163": ["Northwestern", "Wildcats", "Evanston"],
    "264": ["USC", "Trojans", "Southern Cal", "Fight On", "Los Angeles"],
    "26": ["UCLA", "Bruins", "Westwood", "Los Angeles"],
    "2483": ["Oregon", "Ducks", "Eugene", "Autzen"],
    "265": ["Washington", "Huskies", "UW", "Seattle", "Dawgs"],

    # Big 12
    "2628": ["Texas", "Longhorns", "UT", "Austin", "Hook Em", "Horns"],
    "251": ["Texas Tech", "Red Raiders", "TTU", "Lubbock", "Guns Up"],
    "239": ["Oklahoma", "Sooners", "OU", "Norman", "Boomer Sooner"],
    "197": ["Oklahoma State", "Cowboys", "OSU", "Pokes", "Stillwater"],
    "2050": ["Baylor", "Bears", "Waco", "Sic Em"],
    "2306": ["TCU", "Horned Frogs", "Texas Christian", "Fort Worth"],
    "66": ["Iowa State", "Cyclones", "ISU", "Ames"],
    "2641": ["Kansas State", "Wildcats", "K-State", "KSU", "Manhattan"],
    "2305": ["Kansas", "Jayhawks", "KU", "Rock Chalk", "Lawrence"],
    "277": ["West Virginia", "Mountaineers", "WVU", "Morgantown"],
    "2116": ["Cincinnati", "Bearcats", "UC", "Cincy"],
    "248": ["Houston", "Cougars", "UH", "Coogs"],
    "2116": ["UCF", "Knights", "Central Florida", "Orlando", "Bounce House"],
    "252": ["BYU", "Cougars", "Brigham Young", "Provo"],
    "2117": ["Colorado", "Buffaloes", "Buffs", "CU", "Boulder", "Deion"],
    "12": ["Arizona State", "Sun Devils", "ASU", "Tempe", "Fork Em"],
    "9": ["Arizona", "Wildcats", "UA", "Tucson", "Bear Down"],
    "254": ["Utah", "Utes", "Salt Lake City", "MUSS"],

    # ACC
    "150": ["Clemson", "Tigers", "Death Valley", "All In"],
    "52": ["Florida State", "Seminoles", "FSU", "Noles", "Tallahassee"],
    "153": ["Miami", "Hurricanes", "Canes", "The U", "Turnover Chain"],
    "59": ["Georgia Tech", "Yellow Jackets", "GT", "Atlanta", "Ramblin Wreck"],
    "99": ["Louisville", "Cardinals", "Cards", "UofL"],
    "154": ["NC State", "Wolfpack", "NCSU", "North Carolina State", "Raleigh"],
    "152": ["North Carolina", "Tar Heels", "UNC", "Chapel Hill", "Tarheels"],
    "258": ["Duke", "Blue Devils", "Durham"],
    "234": ["Virginia", "Cavaliers", "UVA", "Wahoos", "Charlottesville"],
    "259": ["Virginia Tech", "Hokies", "VT", "Blacksburg", "Enter Sandman"],
    "367": ["Pittsburgh", "Panthers", "Pitt"],
    "183": ["Syracuse", "Orange", "Cuse"],
    "228": ["Boston College", "Eagles", "BC"],
    "87": ["Wake Forest", "Demon Deacons", "Wake", "Deacs"],
    "228": ["Notre Dame", "Fighting Irish", "ND", "Irish", "South Bend", "Touchdown Jesus"],
    "278": ["Stanford", "Cardinal", "Palo Alto", "Farm"],
    "25": ["California", "Golden Bears", "Cal", "Berkeley"],
    "183": ["SMU", "Mustangs", "Southern Methodist", "Ponies", "Dallas"],

    # Other notable programs
    "2132": ["Boise State", "Broncos", "BSU", "Boise", "Blue Turf", "Smurf Turf"],
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

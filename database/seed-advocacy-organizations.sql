-- ============================================================================
-- SEED DATA: Advocacy Organizations
-- Urbanist Reform Map
-- Populates advocacy organizations from YIMBY Advocacy Organizations.xlsx
-- ============================================================================

-- ============================================================================
-- SEED DATA: Advocacy Organizations
-- ============================================================================

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('YIMBY LAW', 'https://www.yimbylaw.org/', 'Advocating for housing through legal action')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;


INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('California YIMBY', 'https://californiayimby.org', '80,000+ members; statewide movement; first major political YIMBY group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Up for Growth', 'https://upforgrowth.org', 'National pro-housing organization')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('SF YIMBY', 'https://sfyimby.org', 'Bay Area founding organization')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url) VALUES
  ('East Bay YIMBY', 'https://eastbayyimby.org')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url) VALUES
  ('East Bay for Everyone', 'https://eastbayforeveryone.org')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url) VALUES
  ('South Bay YIMBY', 'https://southbayyimby.org')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Peninsula for Everyone', 'https://peninsulaforeveryone.org', 'Peninsula advocacy group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Abundant Housing LA', 'https://abundanthousingla.org', 'Southern California YIMBY')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url) VALUES
  ('Santa Cruz YIMBY', 'https://santacruzyimby.org')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('People for Housing Orange County', 'https://peopleforhousingorangecounty.org', 'Orange County advocacy group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('California Renters Legal Advocacy and Education Fund (CaRLA)', 'https://carlaonline.org', 'Renter advocacy and legal support')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url) VALUES
  ('YIMBY Denver', 'https://yimbydenver.org')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url) VALUES
  ('Bend YIMBY', 'https://bendyimby.org')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Portland for Everyone', 'https://portlandforeveryone.org', 'Portland advocacy group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Portland: Neighbors Welcome', 'https://portlandneighborswelcome.org', NULL)
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Futurewise', 'https://futurewise.org', 'Washington state advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Liveable Kirkland', 'https://liveablekirkland.org', 'Kirkland city group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Neighbors for Boise', 'https://neighborsforboise.org', 'Boise regional chapter')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Wasatch Advocates for Livable Communities', 'https://walcutah.org', 'Utah regional group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('SLC Neighbors for More Neighbors', 'https://slcneighbors.org', 'Salt Lake City chapter')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Vibrant Littleton', 'https://vibrantlittleton.org', 'Littleton city group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Arizona Neighborhood Project', 'https://arizonaneighborhoodproject.org', 'Arizona state advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Sightline Institute', 'https://www.sightline.org', 'Environmental/sustainability focused')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Greenbelt Alliance', 'https://www.greenbelt.org', 'Bay Area environmental and land use advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Neighbors for More Neighbors', 'https://neighborsformoreneighbors.org', 'Twin Cities YIMBYs')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Abundant Housing Illinois', 'https://abundanthousingil.org', 'Illinois state advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Greater Greater Washington', 'https://greatergreaterwashington.org', 'D.C. regional advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Montgomery for All', 'https://montgomeryforal.org', 'Maryland county group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Coalition for Smarter Growth', 'https://www.coalitionforsmartergrowth.org', 'D.C. regional')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Desegregate Connecticut', 'https://desegregateconnecticut.org', 'Connecticut advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Abundant Housing Michigan', 'https://abundanthomesmichigan.org', 'Michigan state advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('1000 Friends of Wisconsin', 'https://1000fow.org', 'Wisconsin advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Sustain Charlotte', 'https://www.sustaincharlotte.org', 'Charlotte city group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Front Step CLT', 'https://www.frontstepcharlotte.org', 'Charlotte neighborhood group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Open New York', 'https://opennewyork.org', 'NYC regional chapter')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Abundant Housing Massachusetts', 'https://abundanthousingma.org', 'Massachusetts state advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('A Better Cambridge', 'https://www.abettercambridge.org', 'Cambridge city group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Somerville YIMBY', 'https://somerville-yimby.org', 'Somerville city group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('5th Square PAC', 'https://www.5thsquare.com', 'Philadelphia urbanist PAC')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('10, 000 Friends of Pennsylvania', 'https://www.10000friendspa.org', 'Pennsylvania advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Legal Towns Foundation', 'https://legaltownsnj.org', 'New Jersey housing advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Great Homes and Neighborhoods for All', 'https://greatnj.org', 'New Jersey advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Neighbors Welcome! RI', 'https://neighborswelcomeri.org', 'Rhode Island advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Housing Action NH', 'https://housingnewhampshire.org', 'New Hampshire advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Workforce Housing Coalition of Greater Seacoast', 'https://workforcehousngnh.org', 'Seacoast regional')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('603 Forward', 'https://www.603forward.org', 'New Hampshire advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('New Hampshire Youth Movement', 'https://nhamovementorg', 'Youth-focused')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Maine Affordable Housing Coalition', 'https://mainehousing.org', 'Maine advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('AURA', 'https://aura-atx.org/', 'Austin urbanist group')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Friends of Austin Neighborhoods', 'https://friendsofatxneighborhoods.org', 'Austin advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Dallas Neighbors For Housing', 'https://dallasneighborsforhousing.org', 'Dallas advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Texans For Housing', 'https://texansforhousing.org', 'Texas state advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

  INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Texans For Housing', 'https://www.texansforreasonablesolutions.org/', 'Texas abundance advocates')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('YIMBYs of Northern Virginia', 'https://yimbysofnova.org', NULL)
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('YIMBY Durham', 'https://yimbydurham.org', NULL)
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('YIMBY Wilmington', 'https://yimbywilmington.org', NULL)
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('MountainTrue', 'https://mountaintrueorg', 'North Carolina advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Shameful Nuisance', 'https://www.shamefulnuisance.org', 'Chapel Hill area')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('CityBuilder', 'https://www.citybuildernc.org', 'Central NC')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Florida Housing Coalition', 'https://www.floridahousing.org', 'Florida advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Housing Hawai''i''s Future', 'https://housinghawaiisnow.com', 'Hawaii youth-focused')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('1000 Friends of Oregon', 'https://www.1000friendsoforegon.org', 'Oregon advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Common Good Missoula', 'https://www.commongooodmissoula.org', 'Missoula community organizing')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Shelter WF', 'https://www.shelterwf.org', 'Whitefish advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Wyoming Housing Advocacy', 'https://wyominghousingadvocacy.org', 'Wyoming state')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Groundwork', 'https://groundworkarkansas.org', 'Arkansas advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Homewise', 'https://www.homewisefoundation.org', 'New Mexico advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Southwest Energy Efficiency Project', 'https://www.swenergy.org', 'Regional advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Let''s Build Homes', 'https://letsbuildvermontshomes.org', 'Vermont state')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Vermonters for People Oriented Places', 'https://vpop.org', 'Vermont advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('VOICE', 'https://voicenova.org', 'Faith/community organizing')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('ACTION in Montgomery', 'https://www.actionmc.org', 'Maryland county')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('WakeUP Wake County', 'https://www.wakeupwakecounty.org', 'Wake County')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Student HOMES Coalition', 'https://www.studenthomescoalition.org', 'Student-focused')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Anchorage Housing Club', 'https://www.anchoragehouseclub.org', 'Alaska advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Astoria Housing Alliance', 'https://astoriahousingalliance.org', 'Astoria city')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Circulate San Diego', 'https://www.circulatesd.org', 'San Diego advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('HOME of Virginia', 'https://www.homeofva.org', 'Virginia fair housing')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Kirkwood for Everyone', 'https://www.kirkwoodforeveryone.org', 'Kirkwood city')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Urban Phoenix Project', 'https://www.urbanphoenix.org', 'Phoenix advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Welcome Home Westchester', 'https://www.welcomehomewestchester.org', 'Westchester county')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Sustain Saint Paul', 'https://www.sustainsaintpaul.org', 'St. Paul city')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Abundant Housing Vancouver', 'https://abundanthousingvancouver.org', 'Vancouver regional advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Make Housing Affordable', 'https://makehousingaffordable.ca', 'Ottawa regional advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('More Neighbours Toronto (MNTO)', 'https://www.moreneighbours.org', 'Toronto regional advocacy')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('HousingNowTO', 'https://housingnowto.ca', 'Toronto advocacy for public housing')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('YIMBY Toronto', 'https://yimbytor.org', 'Toronto YIMBY movement; annual festival')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO advocacy_organizations (name, website_url, description) VALUES
  ('Canadian Housing Council', 'https://www.canadianhousing.ca', 'National advocacy (pending verification)')
ON CONFLICT (name) DO UPDATE SET
  website_url = EXCLUDED.website_url,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;


-- ============================================================================
-- SEED DATA: Advocacy Organization Places (Many-to-Many Relationships)
-- ============================================================================

-- Note: This uses subqueries to match organizations and places by name.
-- If a place doesn't exist in the places table, the mapping will be skipped.
-- You may need to create missing places first or adjust the place names below.

-- Mapping: YIMBY Law -> California, CA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'YIMBY Law'),
  (SELECT id FROM places WHERE name = 'California' AND state_code = 'CA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'YIMBY Law')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'California' AND state_code = 'CA' AND place_type = 'state');

-- Mapping: California YIMBY -> California, CA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'California YIMBY'),
  (SELECT id FROM places WHERE name = 'California' AND state_code = 'CA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'California YIMBY')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'California' AND state_code = 'CA' AND place_type = 'state');

-- Mapping: SF YIMBY -> San Francisco, CA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'SF YIMBY'),
  (SELECT id FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'SF YIMBY')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city');

-- Mapping: East Bay for Everyone -> San Francisco, CA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'East Bay for Everyone'),
  (SELECT id FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'East Bay for Everyone')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city');

-- Mapping: South Bay YIMBY -> San Francisco, CA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'South Bay YIMBY'),
  (SELECT id FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'South Bay YIMBY')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city');

-- Mapping: Peninsula for Everyone -> San Francisco, CA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Peninsula for Everyone'),
  (SELECT id FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Peninsula for Everyone')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city');

-- Mapping: Abundant Housing LA -> Los Angeles, CA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Abundant Housing LA'),
  (SELECT id FROM places WHERE name = 'Los Angeles' AND state_code = 'CA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Abundant Housing LA')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Los Angeles' AND state_code = 'CA' AND place_type = 'city');

-- Mapping: Santa Cruz YIMBY -> Santa Cruz, CA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Santa Cruz YIMBY'),
  (SELECT id FROM places WHERE name = 'Santa Cruz' AND state_code = 'CA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Santa Cruz YIMBY')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Santa Cruz' AND state_code = 'CA' AND place_type = 'city');

-- Mapping: People for Housing Orange County -> Orange County, CA (county)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'People for Housing Orange County'),
  (SELECT id FROM places WHERE name = 'Orange County' AND state_code = 'CA' AND place_type = 'county')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'People for Housing Orange County')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Orange County' AND state_code = 'CA' AND place_type = 'county');

-- Mapping: California Renters Legal Advocacy and Education Fund (CaRLA) -> California, CA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'California Renters Legal Advocacy and Education Fund (CaRLA)'),
  (SELECT id FROM places WHERE name = 'California' AND state_code = 'CA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'California Renters Legal Advocacy and Education Fund (CaRLA)')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'California' AND state_code = 'CA' AND place_type = 'state');

-- Mapping: YIMBY Denver -> Denver, CO (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'YIMBY Denver'),
  (SELECT id FROM places WHERE name = 'Denver' AND state_code = 'CO' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'YIMBY Denver')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Denver' AND state_code = 'CO' AND place_type = 'city');

-- Mapping: Bend YIMBY -> Bend, OR (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Bend YIMBY'),
  (SELECT id FROM places WHERE name = 'Bend' AND state_code = 'OR' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Bend YIMBY')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Bend' AND state_code = 'OR' AND place_type = 'city');

-- Mapping: Portland for Everyone -> Portland, OR (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Portland for Everyone'),
  (SELECT id FROM places WHERE name = 'Portland' AND state_code = 'OR' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Portland for Everyone')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Portland' AND state_code = 'OR' AND place_type = 'city');

-- Mapping: Portland: Neighbors Welcome -> Portland, OR (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Portland: Neighbors Welcome'),
  (SELECT id FROM places WHERE name = 'Portland' AND state_code = 'OR' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Portland: Neighbors Welcome')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Portland' AND state_code = 'OR' AND place_type = 'city');

-- Mapping: Futurewise -> Washington, WA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Futurewise'),
  (SELECT id FROM places WHERE name = 'Washington' AND state_code = 'WA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Futurewise')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Washington' AND state_code = 'WA' AND place_type = 'state');

-- Mapping: Liveable Kirkland -> Kirkland, WA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Liveable Kirkland'),
  (SELECT id FROM places WHERE name = 'Kirkland' AND state_code = 'WA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Liveable Kirkland')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Kirkland' AND state_code = 'WA' AND place_type = 'city');

-- Mapping: Neighbors for Boise -> Boise, ID (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Neighbors for Boise'),
  (SELECT id FROM places WHERE name = 'Boise' AND state_code = 'ID' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Neighbors for Boise')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Boise' AND state_code = 'ID' AND place_type = 'city');

-- Mapping: Wasatch Advocates for Livable Communities -> Salt Lake City, UT (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Wasatch Advocates for Livable Communities'),
  (SELECT id FROM places WHERE name = 'Salt Lake City' AND state_code = 'UT' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Wasatch Advocates for Livable Communities')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Salt Lake City' AND state_code = 'UT' AND place_type = 'city');

-- Mapping: SLC Neighbors for More Neighbors -> Salt Lake City, UT (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'SLC Neighbors for More Neighbors'),
  (SELECT id FROM places WHERE name = 'Salt Lake City' AND state_code = 'UT' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'SLC Neighbors for More Neighbors')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Salt Lake City' AND state_code = 'UT' AND place_type = 'city');

-- Mapping: Vibrant Littleton -> Littleton, CO (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Vibrant Littleton'),
  (SELECT id FROM places WHERE name = 'Littleton' AND state_code = 'CO' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Vibrant Littleton')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Littleton' AND state_code = 'CO' AND place_type = 'city');

-- Mapping: Arizona Neighborhood Project -> Arizona, AZ (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Arizona Neighborhood Project'),
  (SELECT id FROM places WHERE name = 'Arizona' AND state_code = 'AZ' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Arizona Neighborhood Project')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Arizona' AND state_code = 'AZ' AND place_type = 'state');

-- Mapping: Greenbelt Alliance -> San Francisco, CA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Greenbelt Alliance'),
  (SELECT id FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Greenbelt Alliance')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'San Francisco' AND state_code = 'CA' AND place_type = 'city');

-- Mapping: Neighbors for More Neighbors -> Minneapolis, MN (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Neighbors for More Neighbors'),
  (SELECT id FROM places WHERE name = 'Minneapolis' AND state_code = 'MN' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Neighbors for More Neighbors')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Minneapolis' AND state_code = 'MN' AND place_type = 'city');

-- Mapping: Abundant Housing Illinois -> Illinois, IL (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Abundant Housing Illinois'),
  (SELECT id FROM places WHERE name = 'Illinois' AND state_code = 'IL' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Abundant Housing Illinois')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Illinois' AND state_code = 'IL' AND place_type = 'state');

-- Mapping: Greater Greater Washington -> Washington, DC (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Greater Greater Washington'),
  (SELECT id FROM places WHERE name = 'Washington' AND state_code = 'DC' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Greater Greater Washington')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Washington' AND state_code = 'DC' AND place_type = 'city');

-- Mapping: Montgomery for All -> Montgomery County, MD (county)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Montgomery for All'),
  (SELECT id FROM places WHERE name = 'Montgomery County' AND state_code = 'MD' AND place_type = 'county')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Montgomery for All')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Montgomery County' AND state_code = 'MD' AND place_type = 'county');

-- Mapping: Coalition for Smarter Growth -> Washington, DC (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Coalition for Smarter Growth'),
  (SELECT id FROM places WHERE name = 'Washington' AND state_code = 'DC' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Coalition for Smarter Growth')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Washington' AND state_code = 'DC' AND place_type = 'city');

-- Mapping: Desegregate Connecticut -> Connecticut, CT (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Desegregate Connecticut'),
  (SELECT id FROM places WHERE name = 'Connecticut' AND state_code = 'CT' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Desegregate Connecticut')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Connecticut' AND state_code = 'CT' AND place_type = 'state');

-- Mapping: Abundant Housing Michigan -> Michigan, MI (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Abundant Housing Michigan'),
  (SELECT id FROM places WHERE name = 'Michigan' AND state_code = 'MI' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Abundant Housing Michigan')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Michigan' AND state_code = 'MI' AND place_type = 'state');

-- Mapping: 1000 Friends of Wisconsin -> Wisconsin, WI (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = '1000 Friends of Wisconsin'),
  (SELECT id FROM places WHERE name = 'Wisconsin' AND state_code = 'WI' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = '1000 Friends of Wisconsin')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Wisconsin' AND state_code = 'WI' AND place_type = 'state');

-- Mapping: Sustain Charlotte -> Charlotte, NC (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Sustain Charlotte'),
  (SELECT id FROM places WHERE name = 'Charlotte' AND state_code = 'NC' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Sustain Charlotte')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Charlotte' AND state_code = 'NC' AND place_type = 'city');

-- Mapping: Front Step CLT -> Charlotte, NC (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Front Step CLT'),
  (SELECT id FROM places WHERE name = 'Charlotte' AND state_code = 'NC' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Front Step CLT')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Charlotte' AND state_code = 'NC' AND place_type = 'city');

-- Mapping: Open New York -> New York, NY (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Open New York'),
  (SELECT id FROM places WHERE name = 'New York' AND state_code = 'NY' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Open New York')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'New York' AND state_code = 'NY' AND place_type = 'city');

-- Mapping: Abundant Housing Massachusetts -> Massachusetts, MA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Abundant Housing Massachusetts'),
  (SELECT id FROM places WHERE name = 'Massachusetts' AND state_code = 'MA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Abundant Housing Massachusetts')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Massachusetts' AND state_code = 'MA' AND place_type = 'state');

-- Mapping: A Better Cambridge -> Cambridge, MA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'A Better Cambridge'),
  (SELECT id FROM places WHERE name = 'Cambridge' AND state_code = 'MA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'A Better Cambridge')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Cambridge' AND state_code = 'MA' AND place_type = 'city');

-- Mapping: Somerville YIMBY -> Somerville, MA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Somerville YIMBY'),
  (SELECT id FROM places WHERE name = 'Somerville' AND state_code = 'MA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Somerville YIMBY')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Somerville' AND state_code = 'MA' AND place_type = 'city');

-- Mapping: 5th Square PAC -> Philadelphia, PA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = '5th Square PAC'),
  (SELECT id FROM places WHERE name = 'Philadelphia' AND state_code = 'PA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = '5th Square PAC')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Philadelphia' AND state_code = 'PA' AND place_type = 'city');

-- Mapping: 10,000 Friends of Pennsylvania -> Pennsylvania, PA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = '10,000 Friends of Pennsylvania'),
  (SELECT id FROM places WHERE name = 'Pennsylvania' AND state_code = 'PA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = '10,000 Friends of Pennsylvania')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Pennsylvania' AND state_code = 'PA' AND place_type = 'state');

-- Mapping: Legal Towns Foundation -> New Jersey, NJ (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Legal Towns Foundation'),
  (SELECT id FROM places WHERE name = 'New Jersey' AND state_code = 'NJ' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Legal Towns Foundation')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'New Jersey' AND state_code = 'NJ' AND place_type = 'state');

-- Mapping: Great Homes and Neighborhoods for All -> New Jersey, NJ (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Great Homes and Neighborhoods for All'),
  (SELECT id FROM places WHERE name = 'New Jersey' AND state_code = 'NJ' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Great Homes and Neighborhoods for All')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'New Jersey' AND state_code = 'NJ' AND place_type = 'state');

-- Mapping: Neighbors Welcome! RI -> Rhode Island, RI (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Neighbors Welcome! RI'),
  (SELECT id FROM places WHERE name = 'Rhode Island' AND state_code = 'RI' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Neighbors Welcome! RI')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Rhode Island' AND state_code = 'RI' AND place_type = 'state');

-- Mapping: Housing Action NH -> New Hampshire, NH (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Housing Action NH'),
  (SELECT id FROM places WHERE name = 'New Hampshire' AND state_code = 'NH' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Housing Action NH')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'New Hampshire' AND state_code = 'NH' AND place_type = 'state');

-- Mapping: 603 Forward -> New Hampshire, NH (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = '603 Forward'),
  (SELECT id FROM places WHERE name = 'New Hampshire' AND state_code = 'NH' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = '603 Forward')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'New Hampshire' AND state_code = 'NH' AND place_type = 'state');

-- Mapping: New Hampshire Youth Movement -> New Hampshire, NH (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'New Hampshire Youth Movement'),
  (SELECT id FROM places WHERE name = 'New Hampshire' AND state_code = 'NH' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'New Hampshire Youth Movement')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'New Hampshire' AND state_code = 'NH' AND place_type = 'state');

-- Mapping: Maine Affordable Housing Coalition -> Maine, ME (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Maine Affordable Housing Coalition'),
  (SELECT id FROM places WHERE name = 'Maine' AND state_code = 'ME' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Maine Affordable Housing Coalition')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Maine' AND state_code = 'ME' AND place_type = 'state');

-- Mapping: AURA (Austin Urban Renewal Alliance) -> Austin, TX (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'AURA'),
  (SELECT id FROM places WHERE name = 'Austin' AND state_code = 'TX' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'AURA')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Austin' AND state_code = 'TX' AND place_type = 'city');

-- Mapping: Friends of Austin Neighborhoods -> Austin, TX (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Friends of Austin Neighborhoods'),
  (SELECT id FROM places WHERE name = 'Austin' AND state_code = 'TX' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Friends of Austin Neighborhoods')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Austin' AND state_code = 'TX' AND place_type = 'city');

-- Mapping: Dallas Neighbors For Housing -> Dallas, TX (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Dallas Neighbors For Housing'),
  (SELECT id FROM places WHERE name = 'Dallas' AND state_code = 'TX' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Dallas Neighbors For Housing')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Dallas' AND state_code = 'TX' AND place_type = 'city');

-- Mapping: Texans For Housing -> Texas, TX (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Texans For Housing'),
  (SELECT id FROM places WHERE name = 'Texas' AND state_code = 'TX' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Texans For Housing')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Texas' AND state_code = 'TX' AND place_type = 'state');

-- Mapping: YIMBYs of Northern Virginia -> Virginia, VA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'YIMBYs of Northern Virginia'),
  (SELECT id FROM places WHERE name = 'Virginia' AND state_code = 'VA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'YIMBYs of Northern Virginia')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Virginia' AND state_code = 'VA' AND place_type = 'state');

-- Mapping: YIMBY Durham -> Durham, NC (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'YIMBY Durham'),
  (SELECT id FROM places WHERE name = 'Durham' AND state_code = 'NC' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'YIMBY Durham')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Durham' AND state_code = 'NC' AND place_type = 'city');

-- Mapping: YIMBY Wilmington -> Wilmington, NC (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'YIMBY Wilmington'),
  (SELECT id FROM places WHERE name = 'Wilmington' AND state_code = 'NC' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'YIMBY Wilmington')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Wilmington' AND state_code = 'NC' AND place_type = 'city');

-- Mapping: Shameful Nuisance -> Chapel Hill, NC (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Shameful Nuisance'),
  (SELECT id FROM places WHERE name = 'Chapel Hill' AND state_code = 'NC' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Shameful Nuisance')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Chapel Hill' AND state_code = 'NC' AND place_type = 'city');

-- Mapping: Shameful Nuisance -> Carrboro, NC (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Shameful Nuisance'),
  (SELECT id FROM places WHERE name = 'Carrboro' AND state_code = 'NC' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Shameful Nuisance')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Carrboro' AND state_code = 'NC' AND place_type = 'city');

-- Mapping: CityBuilder -> North Carolina, NC (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'CityBuilder'),
  (SELECT id FROM places WHERE name = 'North Carolina' AND state_code = 'NC' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'CityBuilder')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'North Carolina' AND state_code = 'NC' AND place_type = 'state');

-- Mapping: Florida Housing Coalition -> Florida, FL (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Florida Housing Coalition'),
  (SELECT id FROM places WHERE name = 'Florida' AND state_code = 'FL' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Florida Housing Coalition')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Florida' AND state_code = 'FL' AND place_type = 'state');

-- Mapping: Housing Hawai'i's Future -> Hawaii, HI (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Housing Hawai''i''s Future'),
  (SELECT id FROM places WHERE name = 'Hawaii' AND state_code = 'HI' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Housing Hawai''i''s Future')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Hawaii' AND state_code = 'HI' AND place_type = 'state');

-- Mapping: 1000 Friends of Oregon -> Oregon, OR (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = '1000 Friends of Oregon'),
  (SELECT id FROM places WHERE name = 'Oregon' AND state_code = 'OR' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = '1000 Friends of Oregon')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Oregon' AND state_code = 'OR' AND place_type = 'state');

-- Mapping: Common Good Missoula -> Missoula, MT (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Common Good Missoula'),
  (SELECT id FROM places WHERE name = 'Missoula' AND state_code = 'MT' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Common Good Missoula')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Missoula' AND state_code = 'MT' AND place_type = 'city');

-- Mapping: Shelter WF -> Whitefish, MT (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Shelter WF'),
  (SELECT id FROM places WHERE name = 'Whitefish' AND state_code = 'MT' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Shelter WF')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Whitefish' AND state_code = 'MT' AND place_type = 'city');

-- Mapping: ShelterWF -> Whitefish, MT (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'ShelterWF'),
  (SELECT id FROM places WHERE name = 'Whitefish' AND state_code = 'MT' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'ShelterWF')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Whitefish' AND state_code = 'MT' AND place_type = 'city');

-- Mapping: Wyoming Housing Advocacy -> Wyoming, WY (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Wyoming Housing Advocacy'),
  (SELECT id FROM places WHERE name = 'Wyoming' AND state_code = 'WY' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Wyoming Housing Advocacy')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Wyoming' AND state_code = 'WY' AND place_type = 'state');

-- Mapping: Groundwork -> Arkansas, AR (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Groundwork'),
  (SELECT id FROM places WHERE name = 'Arkansas' AND state_code = 'AR' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Groundwork')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Arkansas' AND state_code = 'AR' AND place_type = 'state');

-- Mapping: Homewise -> Santa Fe, NM (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Homewise'),
  (SELECT id FROM places WHERE name = 'Santa Fe' AND state_code = 'NM' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Homewise')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Santa Fe' AND state_code = 'NM' AND place_type = 'city');

-- Mapping: Homewise -> Albuquerque, NM (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Homewise'),
  (SELECT id FROM places WHERE name = 'Albuquerque' AND state_code = 'NM' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Homewise')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Albuquerque' AND state_code = 'NM' AND place_type = 'city');

-- Mapping: Let's Build Homes -> Vermont, VT (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Let''s Build Homes'),
  (SELECT id FROM places WHERE name = 'Vermont' AND state_code = 'VT' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Let''s Build Homes')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Vermont' AND state_code = 'VT' AND place_type = 'state');

-- Mapping: Vermonters for People Oriented Places -> Vermont, VT (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Vermonters for People Oriented Places'),
  (SELECT id FROM places WHERE name = 'Vermont' AND state_code = 'VT' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Vermonters for People Oriented Places')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Vermont' AND state_code = 'VT' AND place_type = 'state');

-- Mapping: VOICE -> Virginia, VA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'VOICE'),
  (SELECT id FROM places WHERE name = 'Virginia' AND state_code = 'VA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'VOICE')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Virginia' AND state_code = 'VA' AND place_type = 'state');

-- Mapping: ACTION in Montgomery -> Montgomery County, MD (county)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'ACTION in Montgomery'),
  (SELECT id FROM places WHERE name = 'Montgomery County' AND state_code = 'MD' AND place_type = 'county')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'ACTION in Montgomery')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Montgomery County' AND state_code = 'MD' AND place_type = 'county');

-- Mapping: WakeUP Wake County -> Wake County, NC (county)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'WakeUP Wake County'),
  (SELECT id FROM places WHERE name = 'Wake County' AND state_code = 'NC' AND place_type = 'county')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'WakeUP Wake County')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Wake County' AND state_code = 'NC' AND place_type = 'county');

-- Mapping: Student HOMES Coalition -> California, CA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Student HOMES Coalition'),
  (SELECT id FROM places WHERE name = 'California' AND state_code = 'CA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Student HOMES Coalition')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'California' AND state_code = 'CA' AND place_type = 'state');

-- Mapping: Anchorage Housing Club -> Anchorage, AK (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Anchorage Housing Club'),
  (SELECT id FROM places WHERE name = 'Anchorage' AND state_code = 'AK' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Anchorage Housing Club')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Anchorage' AND state_code = 'AK' AND place_type = 'city');

-- Mapping: Astoria Housing Alliance -> Astoria, OR (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Astoria Housing Alliance'),
  (SELECT id FROM places WHERE name = 'Astoria' AND state_code = 'OR' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Astoria Housing Alliance')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Astoria' AND state_code = 'OR' AND place_type = 'city');

-- Mapping: Circulate San Diego -> San Diego, CA (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Circulate San Diego'),
  (SELECT id FROM places WHERE name = 'San Diego' AND state_code = 'CA' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Circulate San Diego')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'San Diego' AND state_code = 'CA' AND place_type = 'city');

-- Mapping: HOME of Virginia -> Virginia, VA (state)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'HOME of Virginia'),
  (SELECT id FROM places WHERE name = 'Virginia' AND state_code = 'VA' AND place_type = 'state')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'HOME of Virginia')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Virginia' AND state_code = 'VA' AND place_type = 'state');

-- Mapping: Kirkwood for Everyone -> Kirkwood, MO (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Kirkwood for Everyone'),
  (SELECT id FROM places WHERE name = 'Kirkwood' AND state_code = 'MO' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Kirkwood for Everyone')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Kirkwood' AND state_code = 'MO' AND place_type = 'city');

-- Mapping: Urban Phoenix Project -> Phoenix, AZ (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Urban Phoenix Project'),
  (SELECT id FROM places WHERE name = 'Phoenix' AND state_code = 'AZ' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Urban Phoenix Project')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Phoenix' AND state_code = 'AZ' AND place_type = 'city');

-- Mapping: Welcome Home Westchester -> Westchester County, NY (county)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Welcome Home Westchester'),
  (SELECT id FROM places WHERE name = 'Westchester County' AND state_code = 'NY' AND place_type = 'county')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Welcome Home Westchester')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Westchester County' AND state_code = 'NY' AND place_type = 'county');

-- Mapping: Sustain Saint Paul -> Saint Paul, MN (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Sustain Saint Paul'),
  (SELECT id FROM places WHERE name = 'Saint Paul' AND state_code = 'MN' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Sustain Saint Paul')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Saint Paul' AND state_code = 'MN' AND place_type = 'city');

-- Mapping: Abundant Housing Vancouver -> Vancouver, BC (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Abundant Housing Vancouver'),
  (SELECT id FROM places WHERE name = 'Vancouver' AND state_code = 'BC' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Abundant Housing Vancouver')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Vancouver' AND state_code = 'BC' AND place_type = 'city');

-- Mapping: Make Housing Affordable -> Ottawa, ON (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'Make Housing Affordable'),
  (SELECT id FROM places WHERE name = 'Ottawa' AND state_code = 'ON' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'Make Housing Affordable')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Ottawa' AND state_code = 'ON' AND place_type = 'city');

-- Mapping: More Neighbours Toronto (MNTO) -> Toronto, ON (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'More Neighbours Toronto (MNTO)'),
  (SELECT id FROM places WHERE name = 'Toronto' AND state_code = 'ON' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'More Neighbours Toronto (MNTO)')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Toronto' AND state_code = 'ON' AND place_type = 'city');

-- Mapping: HousingNowTO -> Toronto, ON (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'HousingNowTO'),
  (SELECT id FROM places WHERE name = 'Toronto' AND state_code = 'ON' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'HousingNowTO')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Toronto' AND state_code = 'ON' AND place_type = 'city');

-- Mapping: YIMBY Toronto -> Toronto, ON (city)
INSERT INTO advocacy_organization_places (advocacy_organization_id, place_id)
SELECT
  (SELECT id FROM advocacy_organizations WHERE name = 'YIMBY Toronto'),
  (SELECT id FROM places WHERE name = 'Toronto' AND state_code = 'ON' AND place_type = 'city')
WHERE EXISTS (SELECT 1 FROM advocacy_organizations WHERE name = 'YIMBY Toronto')
  AND EXISTS (SELECT 1 FROM places WHERE name = 'Toronto' AND state_code = 'ON' AND place_type = 'city');


/* ==========================================================================
 * IE_UNIVERSITIES -- Irish institution directory dataset
 * --------------------------------------------------------------------------
 * PROVENANCE -- READ BEFORE EDITING
 *
 * Every institution in this file, and the `programmes` count beside it, comes
 * from one of Ireland's two official registers of programmes that a non-EEA
 * student's immigration permission is valid for. No institution here is
 * invented, and the list is not padded.
 *
 *   TrustEd Ireland Authorised Providers: List of Eligible Programmes
 *   (Higher Education, Foundation and Quality Assured English Language),
 *   August 2026 -- https://www.trustedireland.ie/
 *     file: trusted-ireland-he-list-of-eligible-programmes.xlsx
 *     6784 programme rows across 38 providers
 *
 *   ILEP -- Interim List of Eligible Programmes, with effect from
 *   11 February 2026 -- https://www.irishimmigration.ie/coming-to-study-in-
 *     ireland/what-are-my-study-options/interim-list-of-eligible-programmes-ilep/
 *     file: Interim-List-of-Eligible-Programmes-July-2026.xlsx
 *     1201 programme rows across 81 providers
 *
 *   snapshots: _tooling/reference/trusted-ireland-he-eligible-programmes.xlsx
 *              _tooling/reference/ilep-july-2026.xlsx   (both 2026-08-24)
 *   rebuild:   python3 _tooling/build_dataset_ie.py
 *
 * `programmes` is REAL DATA, unlike the UK page's `offerRate` placeholder that
 * it replaces -- it is the number of that provider's eligible programmes on the
 * registers above. Read it as breadth of choice on the register. It is NOT a
 * quality score, NOT an enrolment figure and NOT comparable as "size":
 * providers itemise their awards at wildly different granularities, which is
 * why Trinity shows 1655 entries and UCD 564. Do not present it as a ranking.
 *
 * `rank` is a sequential position 1..113. It is meaningful ONLY where `ranked`
 * is true, which is the case for entries 1-12: the Irish institutions in the
 * **QS World University Rankings: Europe 2026** (published 28 January 2026), in
 * QS order. Ireland has exactly 12 entries in that table --
 *      1. Trinity College Dublin, The University of Dublin         QS Europe 29
 *      2. University College Dublin                                QS Europe 38
 *      3. University College Cork                                  QS Europe 95
 *      4. University of Galway                                     QS Europe 98
 *      5. Dublin City University                                   QS Europe 132
 *      6. University of Limerick                                   QS Europe 139
 *      7. Technological University Dublin                          QS Europe =254
 *      8. Maynooth University                                      QS Europe =269
 *      9. Technological University of the Shannon: Midlands Midwest QS Europe 501-510
 *     10. Dundalk Institute of Technology                          QS Europe 651-700
 *     11. South East Technological University (SETU)               QS Europe 651-700
 *     12. National College of Ireland                              QS Europe 701-900
 *
 * For reference, the QS World University Rankings 2027 world table (published
 * 18 June 2026) covers 8 Irish universities:
 *     Trinity College Dublin                         #75
 *     University College Dublin                      #=100
 *     University College Cork                        #220
 *     University of Galway                           #275
 *     University of Limerick                         #=388
 *     Dublin City University                         #408
 *     Maynooth University                            #721-730
 *     Technological University Dublin                #791-800
 *
 * Entries 13-113 carry NO ranking meaning at all. They are ordered by statutory
 * category, and alphabetically within category:
 *     1. University
 *     2. Technological University
 *     3. Institute of Technology
 *     4. Specialist
 *     5. College
 *     6. Language School
 * The UI shows "#N" only when `ranked` is true and a dash otherwise, so these
 * entries are never presented as holding a ranking position.
 *
 * `type` is Ireland's statutory higher-education category, assigned from an
 * explicit table in the build script rather than guessed from the name:
 *     University                   7
 *     Technological University    11
 *     Institute of Technology      2
 *     Specialist                  11
 *     College                     17
 *     Language School             65
 *   "University" is the seven member universities of the Irish Universities
 *   Association (iua.ie, checked 2026-08-24) -- the Irish counterpart to the UK
 *   page's Russell Group flag and the Canadian page's U15.
 *   "Language School" means the provider's register entries are English-language
 *   or language-centre foundation programmes rather than higher-education
 *   awards. That distinction matters: a language programme does not lead to the
 *   Third Level Graduate Programme.
 *
 * `location` is "City, Province". The city comes from the register's own address
 * column, mapped explicitly per provider (the addresses defeat heuristics --
 * ATU Galway-Mayo sits on "Dublin Road, Galway"). All four provinces here are in
 * the Republic; no Northern Ireland institution is listed.
 *
 * `programs` (no "mes") is an indicative list of subject areas -- a descriptor
 * for the card, not a course inventory. Editorial.
 * ========================================================================== */
window.IE_UNIVERSITIES = [
  { id: "trinity-college-dublin-the-university-of-dublin", name: "Trinity College Dublin, the University of Dublin", rank: 1, location: "Dublin, Leinster", type: "University", programmes: "1,655", programs: "Medicine, Law, Engineering, Business, Arts & Humanities" , ranked: true },
  { id: "university-college-dublin", name: "University College Dublin", rank: 2, location: "Dublin, Leinster", type: "University", programmes: "564", programs: "Business, Engineering, Medicine, Agriculture, Computer Science" , ranked: true },
  { id: "university-college-cork-ucc", name: "University College Cork - UCC", rank: 3, location: "Cork, Munster", type: "University", programmes: "388", programs: "Medicine, Law, Food Science, Business, Pharmacy" , ranked: true },
  { id: "university-of-galway", name: "University of Galway", rank: 4, location: "Galway, Connacht", type: "University", programmes: "425", programs: "Medicine, Marine Science, Law, Arts, Engineering" , ranked: true },
  { id: "dublin-city-university", name: "Dublin City University", rank: 5, location: "Dublin, Leinster", type: "University", programmes: "253", programs: "Computing, Business, Communications, Nursing, Education" , ranked: true },
  { id: "university-of-limerick", name: "University of Limerick", rank: 6, location: "Limerick, Munster", type: "University", programmes: "351", programs: "Engineering, Business, Co-operative Education, Science, Physiotherapy" , ranked: true },
  { id: "tu-dublin", name: "TU Dublin", rank: 7, location: "Dublin, Leinster", type: "Technological University", programmes: "353", programs: "Engineering, Architecture, Computing, Hospitality, Media" , ranked: true },
  { id: "maynooth-university", name: "Maynooth University", rank: 8, location: "Maynooth, Leinster", type: "University", programmes: "411", programs: "Arts, Social Science, Computer Science, Robotics, Theology" , ranked: true },
  { id: "technological-university-of-the-shannon-midlands-midwest", name: "Technological University of the Shannon: Midlands Midwest", rank: 9, location: "Athlone, Leinster", type: "Technological University", programmes: "425", programs: "Engineering, Business, Sport Science, Design, Applied Science" , ranked: true },
  { id: "dundalk-institute-of-technology", name: "Dundalk Institute of Technology", rank: 10, location: "Dundalk, Leinster", type: "Institute of Technology", programmes: "101", programs: "Engineering, Computing, Business, Nursing, Creative Arts" , ranked: true },
  { id: "south-east-technological-university-waterford-campus", name: "South East Technological University - Waterford Campus", rank: 11, location: "Waterford, Munster", type: "Technological University", programmes: "199", programs: "Engineering, Business, Health Science, Computing, Architecture" , ranked: true },
  { id: "national-college-of-ireland", name: "National College of Ireland", rank: 12, location: "Dublin, Leinster", type: "College", programmes: "51", programs: "Computing, Business, Data Analytics, Psychology, Fintech" , ranked: true },
  { id: "atlantic-technological-university-galway-mayo", name: "Atlantic Technological University - Galway-Mayo", rank: 13, location: "Galway, Connacht", type: "Technological University", programmes: "163", programs: "Engineering, Computing, Business, Hotel Management, Film" , ranked: false },
  { id: "atlantic-technological-university-donegal", name: "Atlantic Technological University Donegal", rank: 14, location: "Letterkenny, Ulster", type: "Technological University", programmes: "125", programs: "Engineering, Computing, Business, Nursing, Design" , ranked: false },
  { id: "atlantic-technological-university-sligo", name: "Atlantic Technological University Sligo", rank: 15, location: "Sligo, Connacht", type: "Technological University", programmes: "134", programs: "Engineering, Computing, Business, Pharmaceutical Science, Design" , ranked: false },
  { id: "atu-st-angelas-sligo", name: "ATU St Angelas, Sligo", rank: 16, location: "Sligo, Connacht", type: "Technological University", programmes: "12", programs: "Education, Home Economics, Nursing, Health Studies" , ranked: false },
  { id: "munster-technological-university-cork-campus", name: "Munster Technological University - Cork Campus", rank: 17, location: "Cork, Munster", type: "Technological University", programmes: "203", programs: "Engineering, Computing, Business, Nautical Studies, Art" , ranked: false },
  { id: "munster-technological-university-kerry-campus", name: "Munster Technological University - Kerry Campus", rank: 18, location: "Tralee, Munster", type: "Technological University", programmes: "250", programs: "Engineering, Business, Health & Leisure, Computing, Agriculture" , ranked: false },
  { id: "south-east-technological-university-carlow-campus", name: "South East Technological University - Carlow Campus", rank: 19, location: "Carlow, Leinster", type: "Technological University", programmes: "198", programs: "Engineering, Computing, Business, Science, Sport" , ranked: false },
  { id: "south-east-technological-university-wexford-campus", name: "South East Technological University - Wexford Campus", rank: 20, location: "Wexford, Leinster", type: "Technological University", programmes: "24", programs: "Business, Creative Media, Software Development, Nursing" , ranked: false },
  { id: "institute-of-art-design-and-technology-dun-laoghaire", name: "Institute of Art Design and Technology, Dun Laoghaire", rank: 21, location: "Dun Laoghaire, Leinster", type: "Institute of Technology", programmes: "62", programs: "Film, Animation, Design, Psychology, Computing" , ranked: false },
  { id: "ballyfermot-college-of-further-education", name: "Ballyfermot College of Further Education", rank: 22, location: "Dublin, Leinster", type: "Specialist", programmes: "3", programs: "Animation, Media Production, Music Business" , ranked: false },
  { id: "carlow-college-st-patrick-s", name: "Carlow College, St. Patrick's", rank: 23, location: "Carlow, Leinster", type: "Specialist", programmes: "7", programs: "Social Care, Humanities, Criminology, Psychology" , ranked: false },
  { id: "kimmage-development-studies-centre", name: "Kimmage Development Studies Centre", rank: 24, location: "Dublin, Leinster", type: "Specialist", programmes: "2", programs: "Development Studies" , ranked: false },
  { id: "marino-institute-of-education-mie", name: "Marino Institute of Education - MIE", rank: 25, location: "Dublin, Leinster", type: "Specialist", programmes: "3", programs: "Primary Teaching, Education Studies" , ranked: false },
  { id: "mary-immaculate-college", name: "Mary Immaculate College", rank: 26, location: "Limerick, Munster", type: "Specialist", programmes: "64", programs: "Education, Liberal Arts, Psychology, Theology" , ranked: false },
  { id: "national-college-of-art-design", name: "National College of Art & Design", rank: 27, location: "Dublin, Leinster", type: "Specialist", programmes: "59", programs: "Fine Art, Design, Visual Culture, Education" , ranked: false },
  { id: "pulse-college", name: "Pulse College", rank: 28, location: "Dublin, Leinster", type: "Specialist", programmes: "2", programs: "Music Production, Audio Engineering, Game Design" , ranked: false },
  { id: "rcsi", name: "RCSI", rank: 29, location: "Dublin, Leinster", type: "Specialist", programmes: "20", programs: "Medicine, Pharmacy, Physiotherapy, Nursing, Public Health" , ranked: false },
  { id: "royal-irish-academy-of-music", name: "Royal Irish Academy of Music", rank: 30, location: "Dublin, Leinster", type: "Specialist", programmes: "4", programs: "Music Performance, Composition, Music Education" , ranked: false },
  { id: "st-patrick-s-pontifical-university", name: "St Patrick's Pontifical University", rank: 31, location: "Maynooth, Leinster", type: "Specialist", programmes: "37", programs: "Theology, Philosophy, Arts" , ranked: false },
  { id: "the-honorable-society-of-king-s-inn", name: "The Honorable Society of King's Inn", rank: 32, location: "Dublin, Leinster", type: "Specialist", programmes: "1", programs: "Barrister-at-Law, Legal Studies" , ranked: false },
  { id: "american-college-dublin", name: "American College Dublin", rank: 33, location: "Dublin, Leinster", type: "College", programmes: "3", programs: "Liberal Arts, International Business, Music Business" , ranked: false },
  { id: "cct-college-dublin", name: "CCT College Dublin", rank: 34, location: "Dublin, Leinster", type: "College", programmes: "25", programs: "Computing, Business, Data Analytics, Cyber Security" , ranked: false },
  { id: "city-college-dublin-formerly-city-colleges", name: "City College Dublin ( formerly City Colleges )", rank: 35, location: "Dublin, Leinster", type: "College", programmes: "3", programs: "Business, Law, Computing" , ranked: false },
  { id: "city-college-dublin-formerly-progressive-college", name: "City College Dublin ( formerly Progressive College )", rank: 36, location: "Dublin, Leinster", type: "College", programmes: "1", programs: "Business Studies" , ranked: false },
  { id: "dorset-college", name: "Dorset College", rank: 37, location: "Dublin, Leinster", type: "College", programmes: "27", programs: "Business, Computing" , ranked: false },
  { id: "dublin-business-school", name: "Dublin Business School", rank: 38, location: "Dublin, Leinster", type: "College", programmes: "86", programs: "Business, Law, Computing, Psychology, Media" , ranked: false },
  { id: "galway-business-school", name: "Galway Business School", rank: 39, location: "Galway, Connacht", type: "College", programmes: "21", programs: "Business, Management, Digital Marketing" , ranked: false },
  { id: "griffith-college-cork", name: "Griffith College Cork", rank: 40, location: "Cork, Munster", type: "College", programmes: "24", programs: "Business, Computing, Accounting & Finance" , ranked: false },
  { id: "griffith-college-dublin", name: "Griffith College Dublin", rank: 41, location: "Dublin, Leinster", type: "College", programmes: "95", programs: "Business, Law, Computing, Journalism, Design" , ranked: false },
  { id: "griffith-college-limerick", name: "Griffith College Limerick", rank: 42, location: "Limerick, Munster", type: "College", programmes: "31", programs: "Business, Computing, Accounting & Finance" , ranked: false },
  { id: "holmes-institute-dublin", name: "Holmes Institute Dublin", rank: 43, location: "Dublin, Leinster", type: "College", programmes: "2", programs: "Business, Management" , ranked: false },
  { id: "ibat-college-dublin", name: "IBAT College Dublin", rank: 44, location: "Dublin, Leinster", type: "College", programmes: "12", programs: "Business, Computing, Accounting" , ranked: false },
  { id: "icd-business-school", name: "ICD Business School", rank: 45, location: "Dublin, Leinster", type: "College", programmes: "4", programs: "Accounting & Finance, Business" , ranked: false },
  { id: "independent-college", name: "Independent College", rank: 46, location: "Dublin, Leinster", type: "College", programmes: "6", programs: "Business, Law, Journalism" , ranked: false },
  { id: "irish-college-of-humanities-and-applied-science-ichas", name: "Irish College of Humanities and Applied Science - ICHAS", rank: 47, location: "Limerick, Munster", type: "College", programmes: "14", programs: "Counselling, Psychotherapy, Social Care, Psychology" , ranked: false },
  { id: "oncampus-ireland", name: "OnCampus Ireland", rank: 48, location: "Maynooth, Leinster", type: "College", programmes: "2", programs: "Foundation Year, University Pathway Programmes" , ranked: false },
  { id: "academic-bridge-ltd", name: "Academic Bridge Ltd", rank: 49, location: "Dublin, Leinster", type: "Language School", programmes: "12", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "active-language-learning", name: "Active Language Learning", rank: 50, location: "Dun Laoghaire, Leinster", type: "Language School", programmes: "11", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "apollo-language-centre", name: "Apollo Language Centre", rank: 51, location: "Dublin, Leinster", type: "Language School", programmes: "18", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "atc-language-schools", name: "ATC Language Schools", rank: 52, location: "Bray, Leinster", type: "Language School", programmes: "43", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "atlantic-school-of-english-and-active-leisure-ltd", name: "Atlantic School of English and Active Leisure Ltd.", rank: 53, location: "Schull, Munster", type: "Language School", programmes: "3", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "atlas-language-school", name: "Atlas Language School", rank: 54, location: "Dublin, Leinster", type: "Language School", programmes: "17", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "avanti-language-institute", name: "Avanti Language Institute", rank: 55, location: "Naas, Leinster", type: "Language School", programmes: "10", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "babel-academy-of-english-ireland", name: "Babel Academy of English - Ireland", rank: 56, location: "Dublin, Leinster", type: "Language School", programmes: "6", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "berlitz-dublin", name: "Berlitz Dublin", rank: 57, location: "Dublin, Leinster", type: "Language School", programmes: "5", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "castleforbes-college-ltd", name: "Castleforbes College Ltd.", rank: 58, location: "Dublin, Leinster", type: "Language School", programmes: "14", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "celtic-school-of-english", name: "Celtic School of English", rank: 59, location: "Tralee, Munster", type: "Language School", programmes: "11", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "central-school-of-english", name: "Central School Of English", rank: 60, location: "Dublin, Leinster", type: "Language School", programmes: "6", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "centre-of-english-studies", name: "Centre of English Studies", rank: 61, location: "Dublin, Leinster", type: "Language School", programmes: "31", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "centre-of-english-studies-cork-t-a-acet-ireland", name: "Centre of English Studies Cork T/A: ACET Ireland", rank: 62, location: "Cork, Munster", type: "Language School", programmes: "27", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "citas-college-dublin", name: "Citas College Dublin", rank: 63, location: "Dublin, Leinster", type: "Language School", programmes: "16", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "city-college-dublin-faculty-of-language-formerly-city-language-school", name: "City College Dublin Faculty of Language ( formerly City Language School )", rank: 64, location: "Dublin, Leinster", type: "Language School", programmes: "69", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "cork-english-academy", name: "Cork English Academy", rank: 65, location: "Cork, Munster", type: "Language School", programmes: "24", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "cork-english-college", name: "Cork English College", rank: 66, location: "Cork, Munster", type: "Language School", programmes: "28", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "cork-english-world", name: "Cork English World", rank: 67, location: "Cork, Munster", type: "Language School", programmes: "5", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "dcu-international-academy", name: "DCU International Academy", rank: 68, location: "Dublin, Leinster", type: "Language School", programmes: "18", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "delfin-english-school", name: "Delfin English School", rank: 69, location: "Dublin, Leinster", type: "Language School", programmes: "10", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "direct-english", name: "Direct English", rank: 70, location: "Cork, Munster", type: "Language School", programmes: "14", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "donegal-english-language-school", name: "Donegal English Language School", rank: 71, location: "Bundoran, Ulster", type: "Language School", programmes: "1", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "dublin-centre-of-education", name: "Dublin Centre of Education", rank: 72, location: "Dublin, Leinster", type: "Language School", programmes: "12", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "dublin-college-of-advanced-studies-dcas", name: "Dublin College of Advanced Studies - DCAS", rank: 73, location: "Dublin, Leinster", type: "Language School", programmes: "25", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "dublin-cultural-institute-limited", name: "Dublin Cultural Institute Limited", rank: 74, location: "Dublin, Leinster", type: "Language School", programmes: "16", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "ec-dublin", name: "EC Dublin", rank: 75, location: "Dublin, Leinster", type: "Language School", programmes: "14", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "ef-international-language-schools-ltd", name: "EF International Language Schools Ltd", rank: 76, location: "Dublin, Leinster", type: "Language School", programmes: "18", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "eli-schools-dublin-and-drogheda", name: "ELI Schools - Dublin and Drogheda", rank: 77, location: "Dublin, Leinster", type: "Language School", programmes: "41", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "elta", name: "ELTA", rank: 78, location: "Dublin, Leinster", type: "Language School", programmes: "13", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "emerald-cultural-institute", name: "Emerald Cultural Institute", rank: 79, location: "Dublin, Leinster", type: "Language School", programmes: "37", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "english-path-dublin", name: "English Path Dublin", rank: 80, location: "Dun Laoghaire, Leinster", type: "Language School", programmes: "29", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "english-talks", name: "English Talks", rank: 81, location: "Cork, Munster", type: "Language School", programmes: "18", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "englishour", name: "Englishour", rank: 82, location: "Dublin, Leinster", type: "Language School", programmes: "16", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "erin-college", name: "Erin College", rank: 83, location: "Dublin, Leinster", type: "Language School", programmes: "7", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "everest-language-school", name: "Everest Language School", rank: 84, location: "Dublin, Leinster", type: "Language School", programmes: "10", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "future-learning-language-school", name: "Future Learning Language School", rank: 85, location: "Dublin, Leinster", type: "Language School", programmes: "7", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "galway-language-centre", name: "Galway Language Centre", rank: 86, location: "Galway, Connacht", type: "Language School", programmes: "10", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "icot-international-college-of-technology", name: "ICOT - International College of Technology", rank: 87, location: "Dublin, Leinster", type: "Language School", programmes: "20", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "international-house-dublin", name: "International House Dublin", rank: 88, location: "Dublin, Leinster", type: "Language School", programmes: "39", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "irish-college-of-english", name: "Irish College of English", rank: 89, location: "Malahide, Leinster", type: "Language School", programmes: "12", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "ise-ireland-the-international-school-of-english", name: "ISE Ireland - The International School of English", rank: 90, location: "Dublin, Leinster", type: "Language School", programmes: "9", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "isi-dublin", name: "ISI Dublin", rank: 91, location: "Dublin, Leinster", type: "Language School", programmes: "31", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "kaplan-international-languages", name: "Kaplan International Languages", rank: 92, location: "Dublin, Leinster", type: "Language School", programmes: "21", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "killarney-school-of-english", name: "Killarney School of English", rank: 93, location: "Killarney, Munster", type: "Language School", programmes: "11", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "liffey-college", name: "Liffey College", rank: 94, location: "Dublin, Leinster", type: "Language School", programmes: "12", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "limerick-city-college", name: "Limerick City College", rank: 95, location: "Limerick, Munster", type: "Language School", programmes: "10", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "limerick-language-centre", name: "Limerick Language Centre", rank: 96, location: "Limerick, Munster", type: "Language School", programmes: "9", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "native-speaker-ltd", name: "Native Speaker Ltd", rank: 97, location: "Sligo, Connacht", type: "Language School", programmes: "3", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "ned-college", name: "NED College", rank: 98, location: "Dublin, Leinster", type: "Language School", programmes: "16", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "ohc", name: "OHC", rank: 99, location: "Dublin, Leinster", type: "Language School", programmes: "9", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "pace-language-institute", name: "Pace Language Institute", rank: 100, location: "Bray, Leinster", type: "Language School", programmes: "18", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "patrick-s-english-academy", name: "Patrick's English Academy", rank: 101, location: "Cork, Munster", type: "Language School", programmes: "7", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "seda-college", name: "SEDA College", rank: 102, location: "Dublin, Leinster", type: "Language School", programmes: "15", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "swan-training-institute", name: "Swan Training Institute", rank: 103, location: "Dublin, Leinster", type: "Language School", programmes: "12", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "the-asana-school-of-english", name: "The Asana School of English", rank: 104, location: "Cahersiveen, Munster", type: "Language School", programmes: "4", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "the-linguaviva-centre", name: "The Linguaviva Centre", rank: 105, location: "Dublin, Leinster", type: "Language School", programmes: "25", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "the-slaney-language-centre", name: "The Slaney Language Centre", rank: 106, location: "Wexford, Leinster", type: "Language School", programmes: "6", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "travelling-languages", name: "Travelling Languages", rank: 107, location: "Dublin, Leinster", type: "Language School", programmes: "9", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "twin-english-centre-dublin", name: "Twin English Centre Dublin", rank: 108, location: "Dublin, Leinster", type: "Language School", programmes: "32", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "ucc-language-centre", name: "UCC Language Centre", rank: 109, location: "Cork, Munster", type: "Language School", programmes: "48", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "ulearn-english-school-dublin", name: "Ulearn English School Dublin", rank: 110, location: "Dublin, Leinster", type: "Language School", programmes: "16", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "university-of-galway-english-language-centre", name: "University of Galway English Language Centre", rank: 111, location: "Galway, Connacht", type: "Language School", programmes: "1", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "university-of-limerick-language-centre", name: "University of Limerick Language Centre", rank: 112, location: "Limerick, Munster", type: "Language School", programmes: "4", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
  { id: "your-english-language-school", name: "Your English Language School", rank: 113, location: "Dublin, Leinster", type: "Language School", programmes: "9", programs: "English Language Programmes (ACELS / QQI quality assured)" , ranked: false },
];

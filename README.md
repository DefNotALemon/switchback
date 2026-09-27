# Switchback

An e-bike courier game that runs in the browser. No build step: `index.html` holds the page
and styles, `switchback.js` holds the game code.

You run parcels out of a garage on the canyon floor to a cabin on the west slope, a trail
camp on the east bluffs and the lookout on the ridge, on an e-bike with one battery and one
motor between you and the climb.

## The idea

The bike is the mechanic. It's a physical body on a heightfield: lean turns it, momentum
carries through corners, and the tyres hold the ground only as far as the surface lets them.
Hardpack trail grips, soft dirt grips a little less and ruts, gravel and wet rock slide, mud
swallows. Past the limit the bike slides rather than stops, and it keeps sliding until you
get it back under you. Tyres cut ruts into dirt and mud; ride your own line again and the
rut holds the tyre and rolls a little faster.

Jumps are real arcs. The trails have dirt kickers with sharp lips; speed in decides distance,
and W / S pitch the bike in the air. Land flat and the suspension takes it. Land nose-first
and you're walking.

The battery is the budget. Three assist tiers: Eco, Trail and Boost (hold Shift). Boost is
what gets you up the switchbacks and what cooks the motor if you lean on it — overheat and
assist cuts out for a few seconds. Coasting and braking downhill puts a trickle back. The
garage and the repair shed charge you while you stand there. Because the bike climbs, every
run is a loop: up to the drop, back down to the board.

Time runs an hour a minute. Rain fronts roll through and take the grip with them. After
dusk the headlamp cone is what you can see by.

## Playing

- **W / S** pedal, back brake (pitch in the air) · **A / D** lean · **Space** brakes
- **Shift** boost · **Q** Eco / Trail · **Ctrl** wheelie or manual
- **E** job board (at the garage) · **G** workbench (at the garage) · **R** reset the bike
- **V** cycle camera (chase, close, first person, drone) · **Esc** settings · **H** hide help
- Gamepad: left stick steers, RT pedals, LT brakes, RB boost, LB tier, X wheelie, Y workbench, A job board, R3 view, Select reset.

Money comes from deliveries, with bonuses for no crashes, beating the clock and using little
battery. Fragile cargo loses pay when you crash; perishables lose pay every minute. Drops
often hand you a return load for the way home. Parts runs go to the shed, which also
straightens the bike out.

## The workbench

Between runs the garage is the upgrade hub, and the bike is parked in it. Hover a part to see
it fitted before you pay.

| Category | Levels |
|---|---|
| Battery | pack capacity, charger speed, motor cooling |
| Motor | torque curve, boost power, regen |
| Tyres | all-round knobbies, mud spikes, gravel semi-slicks, sticky rock compound |
| Suspension | 100 mm hardtail → 200 mm downhill; more travel soaks landings, wallows in corners |
| Paint | any hue, gloss / matte / chrome (in Settings) |

Progress saves in your browser.

## Running it

Open `index.html`, or play the hosted copy at
<https://defnotalemon.github.io/switchback/>. It also appears in the arcade at
<https://defnotalemon.github.io/>.

Built with three.js (r128, from a CDN). Everything else — terrain, the trail-cutting
switchback generator, rut deformation, bike physics, weather, audio — is hand-rolled in
`switchback.js`.

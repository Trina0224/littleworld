# Jerusalem Map Blueprint v0.1

## Design target

A compressed 2.5D map inspired by Second Temple Jerusalem. Exact distances may be shortened for playability, but relative geography and architectural character should remain credible.

## Core zones

1. **Temple Mount / outer courts** — dominant landmark, teaching and crowd activity.
2. **Temple market edge** — money changers, sacrificial-animal sellers, tables, cages, pens.
3. **Bethesda Pool** — north of the Temple area; pool + colonnade character, patients and families.
4. **Dense city streets / market lanes** — ordinary daily life, food, traders, residents, pilgrims.
5. **Public water point** — a smaller social gathering node inside the compressed city scene.
6. **East route** — exits toward the Kidron Valley, Mount of Olives and Gethsemane expansion area.
7. **South route** — descends toward the City of David / Siloam Pool expansion area.

## Map topology sketch

```text
                         NORTH
                           ^
                           |
                [ BETHESDA POOL ]
                       /   |
              north streets|
                     /      |
        +-----------------------------+
        |        TEMPLE MOUNT         |
        |   courts / colonnades       |
        |                             |
        +-----------------------------+
              |       |        \
       market |   main plaza     \ east gate/road
              |       |           \
       city lanes  water point     \  KIDRON VALLEY
              |                     \ -> MT. OF OLIVES
              |
         south streets
              |
       CITY OF DAVID ROUTE
              |
        [ SILOAM POOL ]
              v
                         SOUTH
```

## First playable visual boundary

The first rendered map should include Temple Mount, Bethesda, nearby streets/markets, public water point, and visible exits toward east and south. Kidron/Gethsemane and Siloam can initially appear as edge destinations or partial extensions.

## Visual rule

- 2.5D / three-quarter top-down view.
- Warm limestone, pale plaster, wood, woven awnings, dusty streets.
- Architecture should evoke Herodian / Second Temple-period Jerusalem, not medieval Europe or later Islamic/Ottoman Jerusalem.
- Ground can be modular/tiled; architecture and props should be reusable modular pieces.
- Large landmarks may use bespoke assembled pieces, but interactive props must remain separate objects.

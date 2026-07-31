/**
 * The component gallery (017 T032 · T015).
 *
 * ### Why this is a route and not a Storybook
 *
 * *"A component library nothing renders is exactly the defect this project has
 * hit five times."* The gallery is registered in `App.tsx` behind
 * `import.meta.env.DEV`, so every component in the layer is mounted by
 * something the app actually builds — not by a parallel tool with its own
 * bundler that can drift from the real one and stay green while the app is
 * broken.
 *
 * Reach it at **`#gallery`** in dev. It is stripped from production by
 * `import.meta.env.DEV`, which Vite replaces with a literal `false` so the
 * whole branch is dead code the bundler drops.
 *
 * `gallery.test.tsx` renders this and asserts each named state is present, so
 * **a state the export draws and this file omits is a test failure**, not
 * something a reviewer has to spot.
 */

import { getAllHeroes } from '@lmntlz/content';
import {
  AppShell,
  Button,
  ConnectionState,
  CooldownRing,
  EffectivenessGrid,
  Header,
  HeroCard,
  MaintenanceNotice,
  Meter,
  Panel,
  Pill,
  PowerSlot,
  Rail,
  RelationshipStrip,
  TextField,
  Toggle,
  TypeBadge,
  type ButtonState,
  type ButtonVariant,
} from '../../components/index.js';
import { DAMAGE_TYPES } from '@lmntlz/content';
import { useState } from 'react';

/** The seven the export draws. `pending` is the seventh, not `success`. */
const BUTTON_STATES: readonly ButtonState[] = [
  'rest',
  'hover',
  'pressed',
  'focus',
  'disabled',
  'loading',
  'pending',
];

const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'ghost',
  'danger',
  'icon',
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Panel span={12}>
      <h2 className="text-h2 mb-3 font-display uppercase tracking-wide">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </Panel>
  );
}

export function GalleryScreen(): React.JSX.Element {
  const roster = getAllHeroes();
  const hero = roster[0]!;
  const squad = roster.slice(0, 6);
  const [toggled, setToggled] = useState(false);

  return (
    <AppShell
      rail={
        <Rail
          activeId="squads"
          entries={[
            { id: 'squads', label: 'Squads' },
            { id: 'roster', label: 'Roster', badge: roster.length },
            { id: 'matchmaking', label: 'Matchmaking' },
            {
              id: 'court',
              label: 'The Court',
              children: [
                { id: 'chat', label: 'Chat' },
                { id: 'guild', label: 'Guild' },
              ],
            },
            { id: 'codex', label: 'Codex' },
          ]}
          footer={<ConnectionState status="connected" latencyMs={38} />}
        />
      }
      header={
        <Header
          shards={2480}
          username="jonupchurch"
          connection={<ConnectionState status="connected" latencyMs={38} />}
          onProfile={() => undefined}
        />
      }
    >
      <Section title="Buttons — seven states">
        <table className="w-full border-separate border-spacing-2">
          <thead>
            <tr>
              <th className="text-caption text-muted text-left font-display">VARIANT</th>
              {BUTTON_STATES.map((state) => (
                <th key={state} className="text-caption text-muted text-left font-display uppercase">
                  {state}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BUTTON_VARIANTS.map((variant) => (
              <tr key={variant}>
                <td className="text-caption text-muted font-display uppercase">{variant}</td>
                {BUTTON_STATES.map((state) => (
                  <td key={state}>
                    <Button variant={variant} state={state}>
                      COMMIT
                    </Button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Sizes">
        <Button size="sm">SM 28</Button>
        <Button size="md">MD 38</Button>
        <Button size="lg">LG 48</Button>
      </Section>

      <Section title="Type badge · nine forces">
        {DAMAGE_TYPES.map((type) => (
          <TypeBadge key={type} type={type} size="md" />
        ))}
      </Section>

      <Section title="Relationship strip · five tiers">
        <RelationshipStrip hero={hero} />
        <RelationshipStrip hero={hero} compact />
      </Section>

      <Section title="Hero card · three scales">
        <HeroCard hero={hero} scale="compact" />
        <HeroCard hero={hero} scale="standard" />
        <HeroCard hero={hero} scale="full" hp={Math.round(hero.stats.toughness * 50 * 0.76)} />
      </Section>

      <Section title="Power slot & cooldown ring">
        <div className="flex w-96 flex-col gap-2">
          <PowerSlot power={hero.powers[0]} onSelect={() => undefined} />
          <PowerSlot power={hero.powers[4]} turnsRemaining={3} />
          <PowerSlot power={hero.powers[5]} gated />
          <PowerSlot power={hero.powers[2]} awaiting />
          <PowerSlot power={null} />
        </div>
        <div className="flex items-center gap-3">
          <CooldownRing turnsRemaining={0} turnsTotal={3} />
          <CooldownRing turnsRemaining={1} turnsTotal={3} />
          <CooldownRing turnsRemaining={3} turnsTotal={3} />
        </div>
      </Section>

      <Section title="Meters & pills">
        <div className="w-64">
          <Meter value={1402} max={1840} tone={hero.primary} label="HP" />
        </div>
        <div className="w-64">
          <Meter value={0} max={0} label="Loading roster" />
        </div>
        <Pill label="HP">1 840</Pill>
        <Pill label="DEF" trend="up" tone="success">
          204
        </Pill>
        <Pill label="SPD" trend="down" tone="danger">
          64
        </Pill>
        <Pill label="CRIT" tone="info">
          12%
        </Pill>
      </Section>

      <Section title="Squad vulnerability · nine-type heat">
        <div className="w-full max-w-2xl">
          <EffectivenessGrid squad={squad} />
        </div>
      </Section>

      <Section title="Inputs & forms">
        <div className="w-64">
          <TextField label="Court name" defaultValue="Warden Court" />
        </div>
        <div className="w-64">
          <TextField label="Court name" defaultValue="Wardn Cort" error="That court doesn't exist." />
        </div>
        <div className="w-64">
          <TextField label="Court name" defaultValue="Locked during battle" disabled />
        </div>
        <div className="w-64">
          <TextField label="Search" defaultValue="dark" adornment="3 / 27" />
        </div>
        <Toggle label="Show resisted hits" checked={toggled} onChange={setToggled} />
      </Section>

      <Section title="Connection & system states">
        <ConnectionState status="connected" latencyMs={38} />
        <ConnectionState status="reconnecting" attempt={2} maxAttempts={5} />
        <ConnectionState status="offline" />
        <MaintenanceNotice secondsRemaining={504} />
        <div className="w-full max-w-xl">
          <MaintenanceNotice inRecess />
        </div>
      </Section>
    </AppShell>
  );
}

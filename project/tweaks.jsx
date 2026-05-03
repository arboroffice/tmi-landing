// Tweaks integration for Stratum
const { useEffect: tweakUseEffect } = React;

const STRATUM_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "steel",
  "display": "grotesk",
  "density": "default",
  "heroVariant": "1",
  "showStats": true,
  "dark": false
}/*EDITMODE-END*/;

function applyStratumTweaks(t) {
  const pal = t.dark ? "dark" : t.palette;
  document.documentElement.dataset.palette = pal;
  document.documentElement.dataset.display = t.display;
  document.documentElement.dataset.density = t.density;
  document.documentElement.dataset.heroVariant = t.heroVariant;
  document.documentElement.dataset.showStats = String(t.showStats);
}

function StratumTweaks() {
  const [t, setTweak] = useTweaks(STRATUM_DEFAULTS);
  tweakUseEffect(() => { applyStratumTweaks(t); }, [t]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Palette">
        <TweakRadio
          label="Color"
          value={t.palette}
          onChange={(v) => setTweak("palette", v)}
          options={[
            { value: "steel", label: "Steel" },
            { value: "earth", label: "Earth" },
          ]}
        />
        <TweakToggle
          label="Dark mode"
          value={t.dark}
          onChange={(v) => setTweak("dark", v)}
        />
      </TweakSection>
      <TweakSection title="Type">
        <TweakRadio
          label="Headline font"
          value={t.display}
          onChange={(v) => setTweak("display", v)}
          options={[
            { value: "grotesk", label: "Grotesk" },
            { value: "serif", label: "Serif" },
            { value: "mono", label: "Mono" },
          ]}
        />
      </TweakSection>
      <TweakSection title="Layout">
        <TweakRadio
          label="Density"
          value={t.density}
          onChange={(v) => setTweak("density", v)}
          options={[
            { value: "default", label: "Generous" },
            { value: "compact", label: "Compact" },
          ]}
        />
        <TweakRadio
          label="Hero variant"
          value={t.heroVariant}
          onChange={(v) => setTweak("heroVariant", v)}
          options={[
            { value: "1", label: "Default" },
            { value: "2", label: "Editorial" },
            { value: "3", label: "Manifesto" },
          ]}
        />
        <TweakToggle
          label="Show stats band"
          value={t.showStats}
          onChange={(v) => setTweak("showStats", v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

// Apply defaults once on first paint so SSR-style flash is minimized
applyStratumTweaks(STRATUM_DEFAULTS);

window.StratumTweaks = StratumTweaks;
window.STRATUM_DEFAULTS = STRATUM_DEFAULTS;

// Industry-specific angle lines for the Intelligent Company Shift campaign.
// Each ICP industry gets its own positive "here's the leverage" line, injected
// into the email as the {{industry_angle}} merge field so every send reads
// specific to that trade. Never a critique, always opportunity.

const ANGLES = {
  hvac:          { label: 'HVAC',            match: ['hvac','heating','air conditioning','cooling','mechanical'], angle: 'the schedule filling itself, every service call answered and booked, and maintenance agreements that renew without anyone chasing them' },
  roofing:       { label: 'roofing',         match: ['roof'], angle: 'every lead answered and booked, jobs and crews tracked in one place, and invoices going out the day the job closes' },
  construction:  { label: 'construction',    match: ['construction','contractor','concrete','excavation','framing','sitework'], angle: 'bids, change orders, and daily reports handled by the system, and one live view of every job, crew, and cost' },
  plumbing:      { label: 'plumbing',        match: ['plumb'], angle: 'every call answered, the board filling itself, and the office running without a person glued to the phone' },
  electrical:    { label: 'electrical',      match: ['electric'], angle: 'dispatch that runs itself, jobs tracked end to end, and invoices and collections on autopilot' },
  oilgas:        { label: 'oil and gas',     match: ['oil','gas','oilfield','wireline','frac','pipeline','energy services','roustabout'], angle: 'field tickets, safety docs, and compliance handled by the system, and one screen over crews, equipment, and jobs' },
  manufacturing: { label: 'manufacturing',   match: ['manufactur','fabricat','machining','plant','production','industrial supply'], angle: 'shift handoffs, work orders, and quality docs captured automatically, and live visibility into production and inventory' },
  logistics:     { label: 'logistics',       match: ['logistic','freight','trucking','transport','carrier','fleet','hauling','courier','3pl','warehous'], angle: 'load and dispatch coordination that runs itself, drivers and assets tracked live, and paperwork that files itself' },
  equipment:     { label: 'equipment rental',match: ['equipment rental','rental','equipment dealer','crane'], angle: 'availability, contracts, and maintenance tracked in one system, and a front desk that never misses a rental request' },
  field:         { label: 'field service',   match: ['field service','pest control','landscap','restoration','pressure wash','septic','appliance repair'], angle: 'every service request answered and scheduled, techs coordinated, and billing that closes the loop automatically' },
};

const DEFAULT = { key: 'industrial', label: 'industrial', angle: 'work that routes itself, the repetitive jobs handled automatically, and one live view of the whole operation' };

// Map a freeform industry / company string to a bucket + its angle line.
export function angleFor(raw) {
  const hay = String(raw || '').toLowerCase();
  for (const key of Object.keys(ANGLES)) {
    if (ANGLES[key].match.some((m) => hay.includes(m))) {
      return { key, label: ANGLES[key].label, angle: ANGLES[key].angle };
    }
  }
  return { key: DEFAULT.key, label: DEFAULT.label, angle: DEFAULT.angle };
}

export const INDUSTRIES = ANGLES;

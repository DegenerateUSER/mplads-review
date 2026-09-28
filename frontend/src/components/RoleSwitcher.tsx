import { ChevronDown, Shield } from "lucide-react";
import type { RoleMode } from "../types";

interface RoleSwitcherProps {
  value: RoleMode;
  onChange: (role: RoleMode) => void;
}

const roles: Array<{ value: RoleMode; label: string; badge: string }> = [
  { value: "ministry", label: "Ministry of Statistics (National)", badge: "National" },
  { value: "state", label: "State Nodal Department", badge: "State" },
  { value: "district", label: "District Authority (DM / DC)", badge: "District" },
  { value: "mp", label: "Member of Parliament (MP)", badge: "MP" },
];

export function RoleSwitcher({ value, onChange }: RoleSwitcherProps) {
  return (
    <div className="role-switcher">
      <Shield className="role-switcher__icon" aria-hidden="true" size={15} strokeWidth={2} />
      <span className="role-switcher__caption">Scope</span>
      <div className="role-switcher__select-wrap">
        <label htmlFor="role-mode" className="sr-only">
          Select audit scope
        </label>
        <select
          id="role-mode"
          value={value}
          onChange={(event) => onChange(event.target.value as RoleMode)}
        >
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <ChevronDown className="role-switcher__chevron" aria-hidden="true" size={13} strokeWidth={2.2} />
      </div>
    </div>
  );
}

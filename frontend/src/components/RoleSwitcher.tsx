import { UsersRound } from "lucide-react";
import type { RoleMode } from "../types";

interface RoleSwitcherProps {
  value: RoleMode;
  onChange: (role: RoleMode) => void;
}

const roles: Array<{ value: RoleMode; label: string }> = [
  { value: "ministry", label: "Ministry" },
  { value: "state", label: "State" },
  { value: "district", label: "District" },
  { value: "mp", label: "MP" },
];

export function RoleSwitcher({ value, onChange }: RoleSwitcherProps) {
  return (
    <div className="role-switcher">
      <UsersRound aria-hidden="true" size={16} strokeWidth={1.8} />
      <label htmlFor="role-mode">Role view</label>
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
    </div>
  );
}

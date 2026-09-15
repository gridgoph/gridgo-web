import { presentVehicle } from "@/lib/vehicle";

type Props = {
  vehicleType: string | null | undefined;
  size?: number;
  className?: string;
};

/**
 * The rider's vehicle as an icon, from the same path data the map pin uses.
 * Decorative on its own: pair it with the vehicle's name in text nearby.
 */
export function VehicleGlyph({ vehicleType, size = 20, className }: Props) {
  const { nodes } = presentVehicle(vehicleType);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {nodes.map(([tag, attrs], index) =>
        tag === "path" ? (
          <path key={index} d={attrs.d} />
        ) : (
          <circle key={index} cx={attrs.cx} cy={attrs.cy} r={attrs.r} />
        ),
      )}
    </svg>
  );
}

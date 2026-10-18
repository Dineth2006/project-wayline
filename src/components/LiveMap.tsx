"use client";
import { useSettings } from "@/hooks/useSettings";
import { WaylineMap } from "./WaylineMap";
import { OSMMap } from "./OSMMap";
import type { Bus, Geofence, Pt, Route } from "@/lib/types";

interface Props {
  buses?: Bus[];
  routes?: Route[];
  routeFilter?: string | null;
  selectedBusId?: string | null;
  onSelectBus?: (id: string) => void;
  fences?: Geofence[];
  className?: string;
}

/**
 * Renders whichever map mode the operator selected:
 * arena → the custom 2D city map · google → OpenStreetMap (x=lng, y=lat).
 */
export function LiveMap({ buses, routes, routeFilter, selectedBusId, onSelectBus, fences, className }: Props) {
  const settings = useSettings();
  const shownRoutes = routeFilter ? (routes ?? []).filter((r) => r.id === routeFilter) : routes ?? [];

  if (settings.mapMode === "google")
    return (
      <OSMMap
        routes={shownRoutes}
        points={[]}
        stops={shownRoutes.flatMap((r) => r.stops ?? [])}
        buses={buses ?? []}
        fitAll
        className={className}
      />
    );

  return (
    <WaylineMap
      buses={buses}
      routes={routes}
      routeFilter={routeFilter}
      selectedBusId={selectedBusId}
      onSelectBus={onSelectBus}
      fences={fences}
      className={className}
    />
  );
}

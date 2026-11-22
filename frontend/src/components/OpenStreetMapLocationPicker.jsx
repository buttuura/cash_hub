import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { LocateFixed } from 'lucide-react';
import { Button } from './ui/button';

const DEFAULT_CENTER = [0.3476, 32.5825];
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const reverseGeocodeCache = new Map();
let lastReverseGeocodeAt = 0;

const markerIcon = new L.Icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function RecenterMap({ position }) {
  const map = useMap();
  const latitude = position?.lat;
  const longitude = position?.lng;

  useEffect(() => {
    if (latitude !== undefined && longitude !== undefined) {
      map.flyTo([latitude, longitude], Math.max(map.getZoom(), 15));
    }
  }, [map, latitude, longitude]);

  return null;
}

function createOpenStreetMapUrl(latitude, longitude) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
}

export default function OpenStreetMapLocationPicker({ selectedPosition, onLocationSelected, onError }) {
  const position = selectedPosition || null;
  const [lookingUpPlace, setLookingUpPlace] = useState(false);
  const geocodeRequestRef = useRef(0);
  const geocodeTimerRef = useRef(null);

  useEffect(() => () => {
    window.clearTimeout(geocodeTimerRef.current);
    geocodeRequestRef.current += 1;
  }, []);

  useEffect(() => {
    if (selectedPosition) return;
    window.clearTimeout(geocodeTimerRef.current);
    geocodeRequestRef.current += 1;
    setLookingUpPlace(false);
  }, [selectedPosition]);

  const selectPosition = ({ lat, lng }) => {
    const requestId = geocodeRequestRef.current + 1;
    geocodeRequestRef.current = requestId;
    window.clearTimeout(geocodeTimerRef.current);

    const selection = {
      location: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      locationUrl: createOpenStreetMapUrl(lat, lng),
      latitude: lat,
      longitude: lng,
    };
    const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    onLocationSelected(selection);

    const cachedPlaceName = reverseGeocodeCache.get(cacheKey);
    if (cachedPlaceName) {
      setLookingUpPlace(false);
      onLocationSelected({ ...selection, location: cachedPlaceName });
      return;
    }

    setLookingUpPlace(true);
    const wait = Math.max(0, NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastReverseGeocodeAt));
    geocodeTimerRef.current = window.setTimeout(async () => {
      lastReverseGeocodeAt = Date.now();
      try {
        const query = new URLSearchParams({
          format: 'jsonv2',
          lat: String(lat),
          lon: String(lng),
          zoom: '18',
          addressdetails: '1',
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`Place lookup failed with status ${response.status}`);
        }
        const result = await response.json();
        const placeName = result.name || result.display_name;
        if (!placeName) {
          throw new Error('No place name was returned');
        }
        reverseGeocodeCache.set(cacheKey, placeName);
        if (reverseGeocodeCache.size > 100) {
          reverseGeocodeCache.delete(reverseGeocodeCache.keys().next().value);
        }
        if (geocodeRequestRef.current === requestId) {
          onLocationSelected({ ...selection, location: placeName });
        }
      } catch {
        if (geocodeRequestRef.current === requestId) {
          onError('Could not find a place name for this point. Its coordinates are saved; you can also enter the address manually.');
        }
      } finally {
        if (geocodeRequestRef.current === requestId) {
          setLookingUpPlace(false);
        }
      }
    }, wait);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      onError('Your browser does not support current-location detection.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => selectPosition({ lat: coords.latitude, lng: coords.longitude }),
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'Allow location access in your browser to use your current location.'
          : error.code === error.POSITION_UNAVAILABLE
            ? 'Your current location is unavailable. Try selecting a point on the map.'
            : 'Could not detect your current location. Try selecting a point on the map.';
        onError(message);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Click the map to pin your location, or use your device location.</p>
        <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation}>
          <LocateFixed className="h-4 w-4" />
          Use my location
        </Button>
      </div>
      <MapContainer
        center={position ? [position.lat, position.lng] : DEFAULT_CENTER}
        zoom={position ? 15 : 12}
        className="h-56 w-full rounded-lg border border-slate-200"
        style={{ zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onSelect={selectPosition} />
        {position && <Marker position={[position.lat, position.lng]} icon={markerIcon} />}
        <RecenterMap position={position} />
      </MapContainer>
      <p className="text-xs text-slate-500" aria-live="polite">
        {lookingUpPlace ? 'Finding place name…' : 'OpenStreetMap contributors.'}
      </p>
    </div>
  );
}
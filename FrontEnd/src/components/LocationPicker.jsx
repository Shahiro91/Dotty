import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const icon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

const round = (value) => Number(value.toFixed(6))

function LocationPicker({ position, onChange }) {
  const containerRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const map = L.map(containerRef.current).setView([position.lat, position.lng], 17)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)
    const marker = L.marker([position.lat, position.lng], { draggable: true, icon }).addTo(map)
    markerRef.current = marker
    const move = (latlng) => onChangeRef.current({ lat: round(latlng.lat), lng: round(latlng.lng) })
    marker.on('dragend', () => move(marker.getLatLng()))
    map.on('click', (event) => { marker.setLatLng(event.latlng); move(event.latlng) })
    return () => map.remove()
    // El mapa se crea una sola vez; las coordenadas nuevas se sincronizan abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    const current = marker.getLatLng()
    if (current.lat !== position.lat || current.lng !== position.lng) {
      marker.setLatLng([position.lat, position.lng])
      marker._map?.panTo([position.lat, position.lng])
    }
  }, [position.lat, position.lng])

  return <div ref={containerRef} style={{ height: 220, width: '100%', borderRadius: 6, overflow: 'hidden' }} role="application" aria-label="Mapa para ajustar la ubicación de entrega" />
}

export default LocationPicker

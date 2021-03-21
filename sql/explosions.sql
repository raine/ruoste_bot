select distinct marker->>'id' as id, marker->>'x' as x, marker->>'y' as y
  from map_markers
 cross join lateral jsonb_array_elements(markers) marker(marker)      
 where marker->>'type' = 'Explosion'

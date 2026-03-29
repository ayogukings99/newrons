/// Vehicle Routing Problem (VRP) Solver
/// Implements Nearest-Neighbor construction + 2-Opt local search improvement
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

// ─── Constants ───────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM: f64 = 6371.0;

// ─── Data Structures ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stop {
    pub id: String,
    pub lat: f64,
    pub lng: f64,
    pub demand: i32,
    pub time_window: Option<(i32, i32)>, // (earliest_hour, latest_hour)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopWithEta {
    pub stop_id: String,
    pub sequence: i32,
    pub lat: f64,
    pub lng: f64,
    pub demand: i32,
    pub cumulative_distance_km: f64,
    pub eta_minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizedRoute {
    pub sequence: Vec<usize>,
    pub total_distance: f64,
    pub stops_with_eta: Vec<StopWithEta>,
}

// ─── Haversine Distance ───────────────────────────────────────────────────────

/// Calculate great-circle distance between two points using Haversine formula
/// Input: latitude and longitude in degrees
/// Output: distance in kilometers
pub fn haversine_km(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
    let lat1_rad = lat1.to_radians();
    let lat2_rad = lat2.to_radians();
    let delta_lat = (lat2 - lat1).to_radians();
    let delta_lng = (lng2 - lng1).to_radians();

    let a = (delta_lat / 2.0).sin().powi(2)
        + lat1_rad.cos() * lat2_rad.cos() * (delta_lng / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    EARTH_RADIUS_KM * c
}

// ─── Distance Matrix Construction ────────────────────────────────────────────

/// Build NxN symmetric distance matrix for all stops
pub fn build_distance_matrix(stops: &[Stop]) -> Vec<Vec<f64>> {
    let n = stops.len();
    let mut matrix = vec![vec![0.0; n]; n];

    for i in 0..n {
        for j in i..n {
            let dist = haversine_km(
                stops[i].lat,
                stops[i].lng,
                stops[j].lat,
                stops[j].lng,
            );
            matrix[i][j] = dist;
            matrix[j][i] = dist;
        }
    }

    matrix
}

// ─── Nearest-Neighbor Construction ──────────────────────────────────────────

/// Greedy nearest-neighbor tour construction starting from depot
/// Returns ordered sequence of stop indices
pub fn nearest_neighbor(matrix: &[Vec<f64>], depot_idx: usize) -> Vec<usize> {
    let n = matrix.len();
    let mut sequence = vec![depot_idx];
    let mut visited = vec![false; n];
    visited[depot_idx] = true;

    let mut current = depot_idx;

    // Greedily select nearest unvisited stop
    while sequence.len() < n {
        let mut nearest_idx = 0;
        let mut nearest_dist = f64::INFINITY;

        for j in 0..n {
            if !visited[j] && matrix[current][j] < nearest_dist {
                nearest_idx = j;
                nearest_dist = matrix[current][j];
            }
        }

        if nearest_dist < f64::INFINITY {
            sequence.push(nearest_idx);
            visited[nearest_idx] = true;
            current = nearest_idx;
        } else {
            break;
        }
    }

    // Return to depot
    sequence.push(depot_idx);

    sequence
}

// ─── 2-Opt Local Search Improvement ─────────────────────────────────────────

/// Iteratively improve tour by swapping edges until no improvement is found
/// This is the 2-opt (two-edge exchange) heuristic
pub fn two_opt(mut sequence: Vec<usize>, matrix: &[Vec<f64>]) -> Vec<usize> {
    let mut improved = true;

    while improved {
        improved = false;

        // Try all possible edge swaps
        for i in 1..sequence.len() - 2 {
            for j in i + 1..sequence.len() - 1 {
                // Calculate change in total distance if we reverse segment [i..=j]
                let a = sequence[i - 1];
                let b = sequence[i];
                let c = sequence[j];
                let d = sequence[j + 1];

                let current_dist = matrix[a][b] + matrix[c][d];
                let new_dist = matrix[a][c] + matrix[b][d];

                // If reversing improves distance, do it
                if new_dist < current_dist {
                    sequence[i..=j].reverse();
                    improved = true;
                }
            }
        }
    }

    sequence
}

// ─── Main VRP Solver ────────────────────────────────────────────────────────

/// Solve VRP using Nearest-Neighbor + 2-Opt
///
/// # Arguments
/// * `depot_idx` - Index of the depot stop (starting/ending point)
/// * `stops` - List of all stops (including depot)
/// * `capacity` - Vehicle capacity (simplified: unused in current impl, for future constraint)
///
/// # Returns
/// OptimizedRoute with ordered sequence, total distance, and ETA per stop
pub fn solve(depot_idx: usize, stops: Vec<Stop>, _capacity: i32) -> Result<OptimizedRoute, String> {
    if stops.is_empty() {
        return Err("No stops provided".to_string());
    }

    if depot_idx >= stops.len() {
        return Err(format!(
            "Invalid depot index {} for {} stops",
            depot_idx,
            stops.len()
        ));
    }

    // Build distance matrix
    let matrix = build_distance_matrix(&stops);

    // Nearest-neighbor construction
    let mut sequence = nearest_neighbor(&matrix, depot_idx);

    // 2-opt improvement
    sequence = two_opt(sequence, &matrix);

    // Calculate total distance
    let total_distance: f64 = (0..sequence.len() - 1)
        .map(|i| matrix[sequence[i]][sequence[i + 1]])
        .sum();

    // Build stops with ETA
    let mut stops_with_eta = Vec::new();
    let mut cumulative_distance = 0.0;

    for (idx, stop_idx) in sequence.iter().enumerate() {
        if idx > 0 {
            cumulative_distance += matrix[sequence[idx - 1]][sequence[idx]];
        }

        let stop = &stops[*stop_idx];

        // ETA: assume 50 km/h average speed + 5 min per stop
        let travel_minutes = (cumulative_distance / 50.0) * 60.0;
        let num_stops = idx as i32;
        let eta_minutes = travel_minutes as i32 + (num_stops * 5);

        stops_with_eta.push(StopWithEta {
            stop_id: stop.id.clone(),
            sequence: idx as i32,
            lat: stop.lat,
            lng: stop.lng,
            demand: stop.demand,
            cumulative_distance_km: cumulative_distance,
            eta_minutes,
        });
    }

    Ok(OptimizedRoute {
        sequence,
        total_distance,
        stops_with_eta,
    })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_haversine_same_point() {
        let dist = haversine_km(0.0, 0.0, 0.0, 0.0);
        assert!(dist < 0.001);
    }

    #[test]
    fn test_haversine_equator() {
        // 1 degree longitude at equator is roughly 111 km
        let dist = haversine_km(0.0, 0.0, 0.0, 1.0);
        assert!((dist - 111.32).abs() < 1.0);
    }

    #[test]
    fn test_distance_matrix_symmetric() {
        let stops = vec![
            Stop {
                id: "A".to_string(),
                lat: 0.0,
                lng: 0.0,
                demand: 5,
                time_window: None,
            },
            Stop {
                id: "B".to_string(),
                lat: 1.0,
                lng: 1.0,
                demand: 3,
                time_window: None,
            },
        ];

        let matrix = build_distance_matrix(&stops);
        assert_eq!(matrix[0][1], matrix[1][0]);
    }

    #[test]
    fn test_nearest_neighbor_simple() {
        let stops = vec![
            Stop {
                id: "depot".to_string(),
                lat: 0.0,
                lng: 0.0,
                demand: 0,
                time_window: None,
            },
            Stop {
                id: "A".to_string(),
                lat: 0.0,
                lng: 1.0,
                demand: 5,
                time_window: None,
            },
            Stop {
                id: "B".to_string(),
                lat: 1.0,
                lng: 0.0,
                demand: 3,
                time_window: None,
            },
        ];

        let matrix = build_distance_matrix(&stops);
        let sequence = nearest_neighbor(&matrix, 0);

        // Should start and end at depot
        assert_eq!(sequence[0], 0);
        assert_eq!(sequence[sequence.len() - 1], 0);
        // Should visit all stops
        assert_eq!(sequence.len(), stops.len() + 1);
    }

    #[test]
    fn test_solve_basic() {
        let stops = vec![
            Stop {
                id: "depot".to_string(),
                lat: 0.0,
                lng: 0.0,
                demand: 0,
                time_window: None,
            },
            Stop {
                id: "A".to_string(),
                lat: 0.0,
                lng: 1.0,
                demand: 5,
                time_window: None,
            },
            Stop {
                id: "B".to_string(),
                lat: 1.0,
                lng: 0.0,
                demand: 3,
                time_window: None,
            },
        ];

        let result = solve(0, stops, 100).expect("solve failed");

        // Total distance should be positive
        assert!(result.total_distance > 0.0);
        // Should have route
        assert!(!result.sequence.is_empty());
        // Should have ETAs
        assert_eq!(result.stops_with_eta.len(), 4); // depot, A, B, back to depot
    }

    #[test]
    fn test_two_opt_improves() {
        // Create a simple 4-stop problem
        let stops = vec![
            Stop {
                id: "depot".to_string(),
                lat: 0.0,
                lng: 0.0,
                demand: 0,
                time_window: None,
            },
            Stop {
                id: "A".to_string(),
                lat: 0.0,
                lng: 1.0,
                demand: 1,
                time_window: None,
            },
            Stop {
                id: "B".to_string(),
                lat: 1.0,
                lng: 1.0,
                demand: 1,
                time_window: None,
            },
            Stop {
                id: "C".to_string(),
                lat: 1.0,
                lng: 0.0,
                demand: 1,
                time_window: None,
            },
        ];

        let matrix = build_distance_matrix(&stops);

        // Bad initial tour: depot -> A -> C -> B -> depot
        let bad_sequence = vec![0, 1, 3, 2, 0];
        let bad_distance: f64 = (0..bad_sequence.len() - 1)
            .map(|i| matrix[bad_sequence[i]][bad_sequence[i + 1]])
            .sum();

        // Improve with 2-opt
        let improved_sequence = two_opt(bad_sequence, &matrix);
        let improved_distance: f64 = (0..improved_sequence.len() - 1)
            .map(|i| matrix[improved_sequence[i]][improved_sequence[i + 1]])
            .sum();

        // Improved should be better or equal
        assert!(improved_distance <= bad_distance + 0.001);
    }
}

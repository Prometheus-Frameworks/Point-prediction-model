/**
 * FFI-2 (TIBER-Forecast #182, TIBER-Ops #71): build the weekly player-card
 * response in the accepted `fantasy_forecast.weekly_player` v1 envelope.
 *
 * This wraps the UNCHANGED scoring path (`scoreWeeklyPlayerService` +
 * `toTiberWeeklyPlayerCard`) — no scoring or model math is touched — and adds
 * exactly the contract identity the v1 card requires: envelope
 * contract/version on both branches, and card contract/version,
 * season/week (echoed from the request, per the frozen exchange rule), and
 * the pinned scoring-profile identity.
 */

import {
  FANTASY_FORECAST_WEEKLY_PLAYER_CARD_CONTRACT,
  FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT,
  FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
  FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE,
  type FantasyForecastWeeklyPlayerCardResponseEnvelopeIssue,
  type FantasyForecastWeeklyPlayerCardResponseV1,
  type FantasyForecastWeeklyPlayerRequestV1,
} from '../../contracts/fantasyForecastWeeklyPlayerV1.js';
import { toTiberWeeklyPlayerCard } from '../../transforms/tiberScoring.js';
import { scoreWeeklyPlayerService } from './scoreWeeklyPlayerService.js';

type EnvelopeIssue = FantasyForecastWeeklyPlayerCardResponseEnvelopeIssue;

const toNonEmptyErrors = (errors: EnvelopeIssue[]): [EnvelopeIssue, ...EnvelopeIssue[]] =>
  errors.length > 0
    ? [errors[0], ...errors.slice(1)]
    : [
        {
          code: 'WEEKLY_PLAYER_CARD_UNAVAILABLE',
          message:
            'Weekly player card is unavailable and the scoring service reported no specific error. Consumers must not substitute zero, cached, or rest-of-season values.',
        },
      ];

/** Build a v1 failure envelope from machine-readable issues (never empty). */
export const buildFantasyForecastWeeklyPlayerCardV1FailureEnvelope = (
  errors: EnvelopeIssue[],
  warnings: EnvelopeIssue[] = [],
): FantasyForecastWeeklyPlayerCardResponseV1 => ({
  contract: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT,
  contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
  ok: false,
  warnings,
  errors: toNonEmptyErrors(errors),
});

export const buildFantasyForecastWeeklyPlayerCardV1Service = (
  request: FantasyForecastWeeklyPlayerRequestV1,
  generatedAt: string = new Date().toISOString(),
): FantasyForecastWeeklyPlayerCardResponseV1 => {
  const result = scoreWeeklyPlayerService({
    players: [...request.players],
    league_context: request.league_context,
    comparison_pool: request.comparison_pool,
    replacement_points_override: request.replacement_points_override,
  });

  if (!result.ok) {
    return buildFantasyForecastWeeklyPlayerCardV1FailureEnvelope(result.errors, result.warnings);
  }

  return {
    contract: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT,
    contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
    ok: true,
    warnings: result.warnings,
    errors: [],
    data: {
      card: {
        ...toTiberWeeklyPlayerCard(result.data.player, generatedAt),
        contract: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_CONTRACT,
        contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
        season: request.season,
        week: request.week,
        scoring_profile: FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE,
      },
    },
  };
};

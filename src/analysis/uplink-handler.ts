/*
 * KickStarter Analysis
 * Uplink Handler
 *
 * This analysis handles action triggered by watched sensor variables
 * Handles the following uplink variables:
 * - status
 * - temperature
 * - humidity
 * - location
 * - alarm (ioguard)
 */

import { Analysis, Utils } from "@tago-io/sdk";
import { Data, TagoContext } from "@tago-io/sdk/lib/types";

import { sensorUplinkLocation } from "../services/uplinks/sensor-uplink-location";
import { sensorUplinkStatus } from "../services/uplinks/sensor-uplink-status";
import { sensorUplinkTempHum } from "../services/uplinks/sensor-uplink-temp-hum";
import { sensorUplinkAlarm } from "../services/uplinks/sensor-uplink-alarm";

/**
 *
 * @param context
 * @param scope
 * @returns
 */
async function startAnalysis(context: TagoContext, scope: Data[]): Promise<void> {
  context.log("Running Analysis");
  console.log("Scope:", scope);

  // Convert environment variables to a JSON.
  const environment = Utils.envToJson(context.environment);
  console.log("Environment:", environment);

  // Check if all tokens needed for the application were provided.
  if (!environment.config_id) {
    throw "Missing config_id environment var";
  } else if (environment.config_id.length !== 24) {
    return context.log('Invalid "config_id" in the environment variable');
  }

  // Just a little hack to set the device_list_button_id that comes from the scope
  // and set it to the environment variables instead. It makes easier to use router function later.
  environment._input_id = (scope as any).find((x: any) => x.device_list_button_id)?.device_list_button_id; //this is probably not needed in uplink handler, only in regular handler

  // The router class will help you route the function the analysis must run
  // based on what had been received in the analysis.
  const router = new Utils.AnalysisRouter({ scope, context, environment });

  // Sensor uplink routing
  router.register(sensorUplinkLocation).whenVariables(["location"]);
  router.register(sensorUplinkStatus).whenVariables(["status", "water_leakage_detected"]);
  router.register(sensorUplinkTempHum).whenVariables(["temperature", "relative_humidity"]);
  router.register(sensorUplinkAlarm).whenVariables(["alarm"]);

  await router.exec();
}

if (!process.env.T_TEST) {
  Analysis.use(startAnalysis, { token: process.env.T_ANALYSIS_TOKEN });
}

export { startAnalysis };

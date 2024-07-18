import { Resources } from "@tago-io/sdk";

import { parseTagoObject } from "../../lib/data.logic";
import { getDashboardByConnectorID } from "../../lib/find-resource";
import { RouterConstructorDevice } from "../../types";
import { sensor_status_false } from "./device-info";

/**
 * Function that validate parameters
 */
async function validateParams({ scope, environment }: RouterConstructorDevice) {
  if (!environment || !scope) {
    throw new Error("Missing parameters");
  }
  const dev_id = (scope[0] as any).device;
  if (!dev_id) {
    return;
  }
}

/**
 * Main function of editing devices
 * @param scope Scope is a variable sent by the analysis
 * @param environment Environment Variable is a resource to send variables values to the context of your script
 */
async function sensorLockControl({ scope, environment }: RouterConstructorDevice) {
  console.log("Change lock status");
  await validateParams({ scope, environment });
  const dev_id = (scope[0] as any).device;
  const new_asset_unlocked = scope.find((x) => x.variable === "asset_unlocked");
  if (!new_asset_unlocked) {
    throw new Error("Missing lock parameter");
  }
  const [asset_unlocked] = await Resources.devices.getDeviceData(dev_id, { variables: "asset_unlocked", qty: 9999 });
  asset_unlocked.value =  new_asset_unlocked.value;
  await Resources.devices.editDeviceData(dev_id, {id:asset_unlocked.id, value:asset_unlocked.value});
  const user_info = await Resources.run.userInfo(environment._user_id);
  console.log("Unlocked by user: " + user_info.name + " userID: " + user_info.id);
}

export { sensorLockControl };




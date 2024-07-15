import { Resources } from "@tago-io/sdk";

import { RouterConstructorData } from "../../types";

/**
 * Function that update the status history
 * @param sensor_dev
 * @param current_sensor_info Current information of the sensor
 */
const updateStatusHistory = async (sensor_id: string, current_sensor_info: any) => {
  const status_history = `# - Sensor reported a new status.`;

  await Resources.devices.sendDeviceData(sensor_id, { variable: "status_history", value: status_history.replace("#", String(current_sensor_info.desc).toUpperCase()) });
};

/**
 * Main function of receiving the uplink status
 * @param context Context is a variable sent by the analysis
 * @param scope Scope is a variable sent by the analysis
 * @param environment Environment Variable is a resource to send variables values to the context of your script
 */
async function sensorUplinkAlarm({ context, scope, environment }: RouterConstructorData) {
  if (!environment || !scope || !context) {
    throw new Error("Missing parameters");
  }
  const { device: sensor_id } = scope[0];

  const sensor_info = await Resources.devices.info(sensor_id);

  const org_id = sensor_info.tags.find((x) => x.key === "organization_id")?.value;
  if (!org_id) {
    throw new Error("Organization not found in Tago");
  }

  const sensor_alarm = scope.find((x) => x.variable === "alarm");
  if (!sensor_alarm) {
    throw new Error("Missing Sensor status");
  }

  //find out if the alarm comes from the ioguard sensor (level 1), or from the asset, cabinet (level 2)
  const sensor_type = sensor_info.tags.find((x) => x.key === "sensor")?.value;
  if (sensor_type != "ioguard" && sensor_type != "cabinet") {
    throw new Error("Alarm came from an unknown source - not ioguard nor cabinet");
  }

  let current_sensor_info;

  if (sensor_type === "ioguard"){
    const asset_id = sensor_info.tags.find((x) => x.key === "asset_id")?.value;
    if (!asset_id) {
      throw new Error("Paired asset not found in system");
    }
    await Resources.devices.sendDeviceData(asset_id,sensor_alarm);
  }

  // if (sensor_alarm.value === "1" || sensor_alarm.value === 1 || sensor_alarm.value === "true") {
  //   current_sensor_info = { icon: "correct-symbol", color: "green" };
  // } else if (sensor_alarm.value === "0" || sensor_alarm.value === 0 || sensor_alarm.value === "false") {
  //   current_sensor_info = { icon: "ban-circle-symbol", color: "red" };
  // }

  // if (!current_sensor_info) {
  //   return;
  // } //"Different uplink message";

  // await updateStatusHistory(sensor_id, current_sensor_info);

  // const group_id = sensor_info.tags.find((x) => x.key === "group_id")?.value;

  // if (!group_id) {
  //   return;
  // } //"Skipped. No group addressed to the sensor."

  // const layers = await Resources.devices.getDeviceData(group_id, { variables: "layers", qty: 9999 });

  // const [dev_id] = await Resources.devices.getDeviceData(group_id, { variables: "dev_id", groups: sensor_id, qty: 1 });
  // if (!dev_id.metadata) {
  //   throw new Error("dev_id.metadata not found in Tago");
  // }
  // const fixed_position_key = `${group_id}${sensor_id}`;
  // const layer = layers.find((x) => (x?.metadata?.fixed_position as any)[fixed_position_key]);
  // if (!layer) {
  //   return;
  // } //"Device has no pin in layer yet."

  // dev_id.metadata.color = current_sensor_info.color;
  // dev_id.metadata.icon = current_sensor_info.icon;

  // await Resources.devices.editDeviceData(group_id, { ...dev_id, metadata: dev_id.metadata });
}

export { sensorUplinkAlarm };

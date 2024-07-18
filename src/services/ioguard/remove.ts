import { Resources } from "@tago-io/sdk";
import { DeviceListScope } from "@tago-io/sdk/lib/modules/Utils/router/router.types";

import { fetchDeviceList } from "../../lib/fetch-device-list";
import { RouterConstructorDevice } from "../../types";

/**
 * Function that remove aggregation data from the organization
 * @param org_id Organization id that devices will be created
 */
async function removeAggregationData(org_id: string) {
  const soil_devices = await fetchDeviceList({
    tags: [
      { key: "device_type", value: "device" },
      { key: "sensor", value: "soil" },
      { key: "organization_id", value: org_id },
    ],
  });

  if (soil_devices.length === 0) {
    await Resources.devices.deleteDeviceData(org_id, { variables: ["temperature_maximum", "temperature_average", "temperature_minimum"], qty: 9999 });
  }
}

/**
 * Main function of deleting devices
 * @param scope Scope is a variable sent by the analysis
 * @param environment Environment Variable is a resource to send variables values to the context of your script
 */
async function ioguardDel({ scope, environment }: RouterConstructorDevice & { scope: DeviceListScope[] }) {
  const config_id = environment.config_id;
  if (!config_id) {
    throw "[Error] No config device ID: config_id.";
  }

  const dev_id = scope[0].device;
  const device_info = await Resources.devices.info(dev_id);
  if (!device_info?.tags) {
    throw new Error("Device not found");
  }

  const group_id = device_info.tags.find((tag) => tag.key === "group_id")?.value;
  const org_id = device_info.tags.find((tag) => tag.key === "organization_id")?.value;
  const asset_id = device_info.tags.find((tag) => tag.key === "asset_id")?.value;
  const ioguard_serial = device_info.tags.find((tag) => tag.key === "ioguard_serial")?.value;

  //Remove ioguard links from the paired asset (cabinet)
  if(asset_id){
    const {tags: cabinet_tags} = await Resources.devices.info(asset_id);
    //remove device tago id from the cabinet tags
    if(cabinet_tags){
      const found_cabinet_ioguard_field = cabinet_tags.find((x) => x.key === "ioguard_id");
      if(found_cabinet_ioguard_field) found_cabinet_ioguard_field.value = "0";

      //Update the cabinet tag to show the sensor is not installed
      const found_cabinet_has_ioguard_field = cabinet_tags.find((x) => x.key === "has_ioguard");
      if(found_cabinet_has_ioguard_field) found_cabinet_has_ioguard_field.value = "false";
      //Update cabinet tags
      await Resources.devices.edit(asset_id, {tags: cabinet_tags});
      //Log ioguard removal to the asset:
      await Resources.devices.sendDeviceData(asset_id, {variable:"event",value: "IOguard sensor " + ioguard_serial + " unpaired from cabinet"});
    }

  }

  if (group_id) {
    await Resources.devices.deleteDeviceData(group_id, { groups: dev_id, qty: 9999 });
  }

  await Resources.devices.deleteDeviceData(config_id, { groups: dev_id, qty: 9999 });

  await Resources.devices.delete(dev_id);

  if (org_id) {
    await Resources.devices.deleteDeviceData(org_id, { groups: dev_id, qty: 9999 });
    await removeAggregationData(org_id);
  }
  
  return console.debug("Device deleted!");
}

export { ioguardDel };

import { Device, Resources } from "@tago-io/sdk";
import { DeviceCreateInfo } from "@tago-io/sdk/lib/types";

import axios from "axios";

import { createDashURL } from "../../lib/create-dash-url";
import { parseTagoObject } from "../../lib/data.logic";
import { fetchDeviceList } from "../../lib/fetch-device-list";
import { getDashboardByTagID } from "../../lib/find-resource";
import { initializeValidation } from "../../lib/validation";
import { DeviceCreated, RouterConstructorData } from "../../types";

interface installDeviceParam {
  new_dev_name: string;
  new_ioguard_serial: string;
  org_id: string;
  network_id: string;
  connector: string;
  new_device_eui: string;
  type: string;
  group_id?: string;
}

/**
 * Simple parser for parsing MMD serials and DevEUI serials
 * @param str Input csv string
 * @output array of arrays
 */
function parseCSV(str) {
  const arr = [];
  let quote = false;  // 'true' means we're inside a quoted field

  // Iterate over each character, keep track of current row and column (of the returned array)
  for (let row = 0, col = 0, c = 0; c < str.length; c++) {
      let cc = str[c], nc = str[c+1];        // Current character, next character
      arr[row] = arr[row] || [];             // Create a new row if necessary
      arr[row][col] = arr[row][col] || '';   // Create a new column (start with empty string) if necessary

      // If the current character is a quotation mark, and we're inside a
      // quoted field, and the next character is also a quotation mark,
      // add a quotation mark to the current column and skip the next character
      if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }

      // If it's just one quotation mark, begin/end quoted field
      if (cc == '"') { quote = !quote; continue; }

      // If it's a comma and we're not in a quoted field, move on to the next column
      if (cc == ',' && !quote) { ++col; continue; }

      // If it's a newline (CRLF) and we're not in a quoted field, skip the next character
      // and move on to the next row and move to column 0 of that new row
      if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }

      // If it's a newline (LF or CR) and we're not in a quoted field,
      // move on to the next row and move to column 0 of that new row
      if (cc == '\n' && !quote) { ++row; col = 0; continue; }
      if (cc == '\r' && !quote) { ++row; col = 0; continue; }

      // Otherwise, append the current character to the current column
      arr[row][col] += cc;
  }
  return arr;
}


/**
 * Function that create devices
 * @param new_dev_name Name of the device
 * @param org_id Organization id that devices will be created
 * @param network_id Network id that devices will be created
 * @param connector Connector id that devices will be created
 * @param new_device_eui Device eui configured by the user
 * @param new_ioguard_serial IOguard serial number
 * @param type Sensor type of the device
 * @param group_id Group id that devices will be created
 */
async function installDevice({ new_dev_name, new_ioguard_serial, org_id, network_id, connector, new_device_eui, type, group_id}: installDeviceParam) {
  //data retention set to 1 month
  const device_data: DeviceCreateInfo = {
    name: new_dev_name,
    network: network_id,
    serie_number: new_device_eui,
    connector,
    type: "immutable",
    chunk_period: "month",
    chunk_retention: 1,
  };

  //creating new device
  const new_dev = await Resources.devices.create(device_data);

  const new_tags = {
    tags: [
      { key: "ioguard_id", value: new_dev.device_id },
      { key: "ioguard_serial", value: new_ioguard_serial},
      { key: "organization_id", value: org_id },
      { key: "device_type", value: "device" },
      { key: "sensor", value: type },
      { key: "dev_eui", value: new_device_eui },
    ],
  };

  if (group_id) {
    new_tags.tags.push({ key: "group_id", value: group_id });
  }

  await Resources.devices.edit(new_dev.device_id, new_tags);

  const new_org_dev = new Device({ token: new_dev.token });

  return { ...new_dev, device: new_org_dev } as DeviceCreated;
}

/**
 * Main function of creating devices
 * @param context Context is a variable sent by the analysis
 * @param scope Number of devices that will be listed
 * @param environment Environment Variable is a resource to send variables values to the context of your script
 */
async function ioguardAdd({ context, scope, environment }: RouterConstructorData) {
  if (!environment || !scope || !context) {
    throw new Error("Missing parameters");
  }

  const org_id = scope[0].device;

  const validate = initializeValidation("dev_validation", org_id);
  await validate("#VAL.REGISTERING#", "warning").catch((error) => console.error(error));

  const sensor_qty = await fetchDeviceList({
    tags: [
      { key: "device_type", value: "device" },
      { key: "organization_id", value: org_id },
    ],
  });

  if (sensor_qty.length >= 50) {
    return validate("#VAL.LIMIT_OF_50_DEVICES_REACHED#", "danger");
  }
  //Collecting data
  const new_dev_name = scope.find((x) => x.variable === "new_dev_name");
  const new_ioguard_serial = scope.find((x) => x.variable === "new_ioguard_serial");
  const new_dev_eui = scope.find((x) => x.variable === "new_dev_eui");
  const new_dev_group = scope.find((x) => x.variable === "new_dev_group");
  const new_dev_type = scope.find((x) => x.variable === "new_dev_type");
  const new_dev_network = scope.find((x) => x.variable === "new_dev_network");
  const new_paired_asset_id = scope.find((x) => x.variable === "paired_asset_id");
  const paired_asset_id = new_paired_asset_id?.value as string;

  if (!new_dev_name || !new_dev_group || !new_dev_type || !new_dev_network || !new_ioguard_serial) {
    throw new Error("Missing variables");
  }
  if ((new_dev_name?.value as string).length < 3) {
    return validate("#VAL.NAME_FIELD_IS_SMALLER_THAN_3_CHAR#", "danger");
  }

  if (!new_dev_type?.value) {
    return validate("#VAL.DEVICE_TYPE_NOT_FOUND_PLEASE_SELECT_AGAIN_THE_DEVICE_TYPE#", "danger");
  }

  if (!new_ioguard_serial?.value) {
    return validate("#VAL.DEVICE_SERIAL_NOT_FOUND_PLEASE_ENTER_THE_DEVICE_SERIAL#", "danger");
  }

  let dev_eui = (new_dev_eui?.value as string)?.toLowerCase();
  //If DevEUI was no provided in the input form, check if there is one in the csv file uploaded to Tago
  //Import serial numbers table from csv file, add csv file url as environment variable serial_csv
  if(!dev_eui){
    const csvSerialFileUrl = environment.serial_csv;
    if (!csvSerialFileUrl) {
      return validate("#VAL.PLEASE_PROVIDE_CSV_CONTAINING_SERIAL_NUMBERS_URL_IN_ENVIRONMENT", "danger");
    }
    const csv = await axios.get(csvSerialFileUrl).then((res) => res.data).catch((e) => {
      throw console.log(e.message);
    });
    //import csv to array
    const ioguard_serials_table = parseCSV(csv);
    //find the position of DevEUI in the csv file (usually 0, it's the first in the csv)
    const eui_array_position = ioguard_serials_table[0].indexOf("DevEUI");
    //find the element containing the new device ioguard serial:
    const serial_found_index = ioguard_serials_table.findIndex(t => { return t.find(i => i === new_ioguard_serial.value)});
    console.log(serial_found_index);
    if(serial_found_index > 0){ 
      dev_eui = ioguard_serials_table[serial_found_index][eui_array_position]?.toLowerCase();
    }
  }
  if (!dev_eui) {
    return validate("#VAL.DEVICE_EUI_NOT_FOUND_PLEASE_SELECT_IT_MANUALLY_OR_UPDATE_CSV_FILE#", "danger");
  }
  

  const dev_exists = await fetchDeviceList({ tags: [{ key: "dev_eui", value: dev_eui }] });

  if (dev_exists.length > 0) {
    console.debug("IOguard EUI already in use.");
    return validate("IOguard EUI already in use.", "danger");
  }

  const group_id = new_dev_group?.value as string;

  const connector_id = new_dev_type.value as string;

  const dash_id = await getDashboardByTagID("ioguard_dashboard");

  const dash_info = await Resources.dashboards.info(dash_id);
  const type = dash_info.blueprint_devices.find((bp) => bp.conditions[0].key === "sensor");
  if (!type) {
    return validate("#VAL.ERROR__DASHBOARD_IS_MISSING_THE_BLUEPRINT_DEVICE_SENSOR#", "danger");
  }

  const { device_id } = await installDevice({
    new_dev_name: new_dev_name.value as string,
    new_ioguard_serial: new_ioguard_serial.value as string,
    org_id,
    network_id: new_dev_network.value as string,
    connector: connector_id,
    new_device_eui: dev_eui,
    type: type.conditions[0].value,
    group_id,
  });

  //Update the paired asset (cabinet) with the ioguard info
  const {tags: cabinet_tags} = await Resources.devices.info(paired_asset_id);
  //Add new device tago id to the cabinet tags
  cabinet_tags.find((x) => x.key === "paired_ioguard_id").value = device_id;
  //Update the cabinet tag to show the sensor is installed
  cabinet_tags.find((x) => x.key === "has_ioguard").value = "true";
  //Update cabinet tags
  await Resources.devices.edit(paired_asset_id, {tags: cabinet_tags});

  // //Now also update the metadata of the organization and group virtual sensor used for map
  // Find group device if(group_id)
  // Find variable with cabinet ID: paired_asset_id
  // Edit metadata, icon, color, status protected
  var [{id:group_record_id, metadata:group_dev_metadata}] = await Resources.devices.getDeviceData(group_id, { variables: "dev_id", groups: paired_asset_id, qty: 1 });
  group_dev_metadata.color = "green";
  group_dev_metadata.icon = "padlock";
  await Resources.devices.editDeviceData(group_id, {id:group_record_id, metadata:group_dev_metadata});
  // Find org device: org_id
  // Find variable with cabinet ID: paired_asset_id
  // Edit metadata, icon, color, status protected
  var [{id:org_record_id, metadata:org_dev_metadata}] = await Resources.devices.getDeviceData(org_id, { variables: "dev_id", groups: paired_asset_id, qty: 1 });
  org_dev_metadata.color = "green";
  org_dev_metadata.icon = "padlock";
  await Resources.devices.editDeviceData(org_id, {id:org_record_id, metadata:org_dev_metadata});


  


  const url = createDashURL(dash_id, { org_dev: org_id, sensor: device_id });

  const dev_data = parseTagoObject(
    {
      dev_id: {
        value: device_id,
        metadata: {
          label: new_dev_name.value,
          url,
          status: "unknwon",
          type: dash_info.type,
        },
      },
    },
    device_id
  );

  await Resources.devices.paramSet(device_id, {
    key: "dashboard_url",
    value: url,
    sent: false,
  });

  await Resources.devices.paramSet(device_id, { key: "dev_eui", value: dev_eui, sent: false });
  await Resources.devices.paramSet(device_id, { key: "dev_group", value: (new_dev_group?.metadata?.label as string) || "", sent: false });
  await Resources.devices.paramSet(device_id, { key: "dev_lastcheckin", value: "-", sent: false });
  await Resources.devices.paramSet(device_id, { key: "dev_battery", value: "-", sent: false });




  const add_to_dropdown_list = parseTagoObject({ asset_list: new_dev_name.value }, device_id);
  await Resources.devices.sendDeviceData(org_id, dev_data.concat(add_to_dropdown_list));

  if (group_id) {
    await Resources.devices.sendDeviceData(new_dev_group.value as string, dev_data);
  }

  return validate("#VAL.DEVICE_CREATED_SUCCESSFULLY#", "success");
}

export { ioguardAdd };

import { Resources } from "@tago-io/sdk";

import { parseTagoObject } from "../../lib/data.logic";
import { getDashboardByConnectorID } from "../../lib/find-resource";
import { RouterConstructorDevice } from "../../types";
import { sensor_status_false } from "./device-info";

import { initializeValidation } from "../../lib/validation";

/**
 * Function that validate parameters
 */
async function validateParams({ scope, environment }: RouterConstructorDevice) {
  if (!environment || !scope) {
    throw new Error("Missing parameters");
  }
  const asset_id = (scope[0] as any).device;
  if (!asset_id) {
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
  const asset_id = (scope[0] as any).device;

  const validate = initializeValidation("dev_validation", asset_id);
  await validate("#VAL.REGISTERING#", "warning").catch((error) => console.error(error));

  const new_asset_unlocked = scope.find((x) => x.variable === "asset_unlocked");
  if (!new_asset_unlocked) {
    throw new Error("Missing lock parameter");
  }

  const {tags: cabinet_tags} = await Resources.devices.info(asset_id);
  const ioguard_id = cabinet_tags.find((x) => x.key === "ioguard_id")?.value;
  
  //reject lock command if ioguard is not installed
  if(!new_asset_unlocked.value){
    //check if the asset has paired ioguard sensor
    if(ioguard_id == "0"){ 
      return validate("#VAL.ASSET_SENSOR_NOT_INSTALLED#", "danger");
    }
  }

  //get the asset_unlocked variable
  let [asset_unlocked] = await Resources.devices.getDeviceData(asset_id, { variables: "asset_unlocked", qty: 1 });
  if(!asset_unlocked){
    await Resources.devices.sendDeviceData(asset_id, {variable:"asset_unlocked",value: true});
    return validate("#VAL.ERROR_TRY_AGAIN#", "danger");
  }
  console.log(asset_unlocked);
  //check if the service_active flag exists, create if not
  const [service_active] = await Resources.devices.getDeviceData(asset_id, { variables: "service_active", qty: 1 });
  if(!service_active){ //edit if variable already exists 
    await Resources.devices.sendDeviceData(asset_id, {variable:"service_active",value: false});
    return validate("#VAL.ERROR_TRY_AGAIN#", "danger");
  }

  
  //if clear alarms command is received, check the current conditions
  const clear_alarms = scope.find((x) => x.variable === "clear_alarms");
  if(clear_alarms?.value){
    //reject clear command if the ioguard has any active alarms
    const [short_status] = await Resources.devices.getDeviceData(ioguard_id, { variables: "short_status", qty: 1 });
    if(short_status?.value != "00000000"){
      return validate("#VAL.SENSOR_ALARM_ACTIVE#", "danger");
    }
    //clear active_alarms in the asset if conditions are met
    const [active_alarms] = await Resources.devices.getDeviceData(asset_id, { variables: "active_alarms", qty: 1 });
    const send_zero = 0;
    if(active_alarms){ //edit if variable already exists 
      await Resources.devices.editDeviceData(asset_id, {id:active_alarms.id, value:send_zero.toString(2).padStart(8, '0')});
    }
    else{ //or create if not
      await Resources.devices.sendDeviceData(asset_id, {variable:"active_alarms",value:send_zero.toString(2).padStart(8, '0')});
    }

    //also clear the ioguard device alarm
    await Resources.devices.sendDeviceData(ioguard_id, {variable:"alarm",value:send_zero.toString(2).padStart(8, '0')});
    console.log("alarm cleared");
  }

  asset_unlocked.value =  new_asset_unlocked.value;
  await Resources.devices.editDeviceData(asset_id, {id:asset_unlocked.id, value:asset_unlocked.value});

  //unlock command received
  if(!asset_unlocked.value){
    await Resources.devices.editDeviceData(asset_id, {id:service_active.id, value:false});
  }



  if(environment._user_id){ //unlocked by run user
    const user_info = await Resources.run.userInfo(environment._user_id);
    if(asset_unlocked.value){
      console.log("Unlocked by user: " + user_info.name + " userID: " + user_info.id);
      await Resources.devices.sendDeviceData(asset_id, {variable:"event",value: "Unlocked by user: " + user_info.name + " userID: " + user_info.id});
      return validate("#VAL.ASSET_UNLOCKED#", "success");
    }
    else{
      console.log("Locked by user: " + user_info.name + " userID: " + user_info.id);
      await Resources.devices.sendDeviceData(asset_id, {variable:"event",value: "Locked by user: " + user_info.name + ", userID: " + user_info.id});
      return validate("#VAL.ASSET_LOCKED#", "success");
    }

  }
  else{
    console.log(asset_unlocked.value? "Unlocked by unknown user: ":"Locked by unknown user: ");
    await Resources.devices.sendDeviceData(asset_id, {variable:"event",value: asset_unlocked.value? "Unlocked by unknown user.":"Locked by unknown user."});
    return validate(asset_unlocked.value? "#VAL.ASSET_UNLOCKED#":"#VAL.ASSET_LOCKED#", "success");
  }
}

export { sensorLockControl };




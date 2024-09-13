import { Resources } from "@tago-io/sdk";
import { parseTagoObject } from "../../lib/data.logic";

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

  //find out if the alarm comes from the ioguard sensor, or from the copy in the asset
  const sensor_type = sensor_info.tags.find((x) => x.key === "sensor")?.value;
  if (sensor_type != "ioguard" && sensor_type != "cabinet") {
    throw new Error("Alarm came from an unknown source - not ioguard nor cabinet");
  }

  let current_sensor_info;

  ///////////////////////////////
  //Process the iouguard alarm //
  ///////////////////////////////
  if (sensor_type === "ioguard"){

    //find paired asset
    const asset_id = sensor_info.tags.find((x) => x.key === "asset_id")?.value;
    if (!asset_id) {
      throw new Error("Paired asset not found in system");
    }

    //find in which group is the asset
    const asset_info = await Resources.devices.info(asset_id);
    const group_id = asset_info.tags.find((x) => x.key === "group_id")?.value;
    if (!group_id) {
      throw new Error("Asset is not assigned to any group");
    } //"Skipped. No group addressed to the sensor."

    //not used for now
    const layers = await Resources.devices.getDeviceData(group_id, { variables: "layers", qty: 9999 });

    //object which represents the asset in the group device
    const [dev_id] = await Resources.devices.getDeviceData(group_id, { variables: "dev_id", groups: asset_id, qty: 1 });
    if (!dev_id.metadata) {
      throw new Error("dev_id.metadata not found in Tago");
    }
    //object which represents the corresponding paired variable used for filtering in the map widget
    const [dev_id_hidden] = await Resources.devices.getDeviceData(group_id, { variables: "dev_id_hidden", groups: asset_id, qty: 1 });
    if (!dev_id_hidden) {
      //if not already existing, create in parallel a paired variable used for filtering in the map widget
      const dev_data_hidden = parseTagoObject(
        {
          dev_id_hidden: {
            value: "grey", //initialize with the same value as in the dev_id metadata
          },
        },
        dev_id.group //same group as the dev_id variable
      );
      await Resources.devices.sendDeviceData(group_id, dev_data_hidden);
    }
  
    // const fixed_position_key = `${group_id}${asset_id}`;
    // const layer = layers.find((x) => (x?.metadata?.fixed_position as any)[fixed_position_key]);
    // if (!layer) {
    //   console.log("device still has no pin");
    //   return;
    // } //"Device has no pin in layer yet."

                                                                                                    

    //Check if the asset_unlocked and service_active exist
    let [asset_unlocked] = await Resources.devices.getDeviceData(asset_id, { variables: "asset_unlocked", qty: 1 });
    let [service_active] = await Resources.devices.getDeviceData(asset_id, { variables: "service_active", qty: 1 });
    

    //cabinet unlocked
    if(asset_unlocked?.value){
      
      //if service_active variable doesn't exist yet, or service_active == false, initialize/set to true
      if(!service_active || !service_active.value){
          if(!service_active){
            //create service_active variable in the asset bucket
            await Resources.devices.sendDeviceData(asset_id, {variable: "service_active", value:true}); 
          }
          else{
            //set service_active to active 
            await Resources.devices.editDeviceData(asset_id, {id:service_active.id, value:true});
          }
          
          //log the event to the asset bucket
          await Resources.devices.sendDeviceData(asset_id, {variable:"event",value: "Service detected"});
          //update the icon and color
          current_sensor_info = { icon: "open-wrench-tool-silhouette", color: "orange" };
          console.log("service started");
      }
      else{
        //service was already active
        console.log("service already active, ignore the alarm");
      }
    }
    else{
      //Cabinet is locked, process arrived alarm
      console.log("Cabinet is locked, alarm arrived");
      
      //check if the alarm is already active in the asset (per sensor, each bit represents a sensor), if not defined, consider as none
      const [active_alarms] = await Resources.devices.getDeviceData(asset_id, { variables: "active_alarms", qty: 1 });
      const val_active_alarms = active_alarms? active_alarms.value : 0;
      let bin_active_alarms = parseInt(val_active_alarms as string, 2);
      console.log("active alarms " + bin_active_alarms.toString(2).padStart(8, '0'));
      
      //bitmask to  filter only the alarms which should be reported - choose which are relevant for notification
      const [monitored_alarms] = await Resources.devices.getDeviceData(asset_id, { variables: "monitored_alarms", qty: 1 });
      const val_monitored_alarms = monitored_alarms? monitored_alarms.value : "11011100"; //default, monitor all but reserved and proximity
      let bin_monitored_alarms = parseInt(val_monitored_alarms as string, 2);
      console.log("monitored " + bin_monitored_alarms.toString(2).padStart(8, '0'));
      
      //new alarm arrived
      const received_alarms = sensor_alarm.metadata?.short_status;
      const bin_received_alarms = parseInt(received_alarms, 2);
      console.log("new alarms: " + received_alarms);
      const new_alarms_to_send = (bin_received_alarms & ~bin_active_alarms & bin_monitored_alarms).toString(2).padStart(8, '0');

      if(+new_alarms_to_send){
        console.log("alarms to report: " + new_alarms_to_send);
        const alarm_names = ["temperature", "humidity", "reserved1", "force", "door open", "light detected", "presence detected", "reserved2"];
        const list_of_new_alarms =  alarm_names.filter((name) => (new_alarms_to_send.split("")[alarm_names.indexOf(name)] === "1" )).join(', ');
        const list_of_old_alarms = alarm_names.filter((name) => (bin_active_alarms.toString(2).padStart(8, '0').split("")[alarm_names.indexOf(name)] === "1" )).join(', ');
        console.log("New:" + list_of_new_alarms);
        console.log("Old:" + list_of_old_alarms);
  
        await Resources.devices.sendDeviceData(asset_id, {variable: "report_alarms", value: list_of_new_alarms, metadata:{Old_alarms: list_of_old_alarms}});
        current_sensor_info = { icon: "bell", color: "red" };


        //update active alarms with newly arrived
        bin_active_alarms |= bin_received_alarms;
        if(!active_alarms){ //no previously saved alarms
          //create active_alarms variable in the asset bucket
          await Resources.devices.sendDeviceData(asset_id, {variable: "active_alarms", value:bin_active_alarms.toString(2).padStart(8, '0')}); 
        }
        else{
          //updated active_alarms 
          await Resources.devices.editDeviceData(asset_id, {id:active_alarms.id, value:bin_active_alarms.toString(2).padStart(8, '0')});
        }
      }
    }



      //await Resources.devices.sendDeviceData(asset_id,sensor_alarm);



      if (!current_sensor_info) {
        return;
      } //nothing to update on the icon

      //update pin icon and color
      dev_id.metadata.color = current_sensor_info.color;
      dev_id.metadata.icon = current_sensor_info.icon;

      await Resources.devices.editDeviceData(group_id, { ...dev_id, metadata: dev_id.metadata });
      //also update the paired variable dev_id_hidden used for filtering in the map widget.
      await Resources.devices.editDeviceData(group_id, {id:dev_id_hidden.id, value:current_sensor_info.color});

      // await updateStatusHistory(sensor_id, current_sensor_info);
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


}

export { sensorUplinkAlarm };

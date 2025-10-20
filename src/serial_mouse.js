import { LOG_SERIAL } from "./const.js";
import { dbg_log } from "./log.js";

// For Types Only
import { BusConnector } from "./bus.js";
import { CPU } from "./cpu.js";
import { UART } from "./uart.js";

const RESET_DATA = new Uint8Array([0x4D, 0x33]); // "M3" ID

/**
 * Microsoft Serial Mouse
 * @constructor
 * @param {CPU} cpu
 * @param {UART} serial
 * @param {BusConnector} bus
 */
export function SerialMouse(cpu, serial, bus)
{
    /** @const @type {CPU} */
    this.cpu = cpu;

    /** @const @type {UART} */
    this.serial = serial;

    /** @const @type {BusConnector} */
    this.bus = bus;

    this.enabled = false;

    this.buttons = [false, false, false];

    this.delta_x = 0;
    this.delta_y = 0;

    this.last_toggle = false;

    this.buffer = new Uint8Array(3);

    this.bus.register("mouse-click", function(data)
    {
        this.buttons = data;
        this.send_mouse_packet(0, 0);
        if(data[1])
        {
            this.send_middle_button_press();
        }
    }, this);

    this.bus.register("mouse-delta", function(data)
    {
        this.send_delta(data[0], data[1]);
    }, this);

    var mouse = this;

    this.serial.on_mcr_change = function(out_byte)
    {
        // bit 0: DTR, bit 1: RTS
        const current_toggle = (out_byte & 0x3) === 0x3;

        if(!mouse.last_toggle && current_toggle)
        {
            mouse.mouse_reset();
            mouse.enabled = true;
            mouse.bus.send("mouse-enable", mouse.enabled);
        }

        mouse.last_toggle = current_toggle;
    };
}

SerialMouse.prototype.get_state = function()
{
    var state = [];

    state[0] = this.enabled;
    state[1] = this.buttons;
    state[2] = this.delta_x;
    state[3] = this.delta_y;
    state[4] = this.last_toggle;

    return state;
};

SerialMouse.prototype.set_state = function(state)
{
    this.enabled = state[0] || false;
    this.buttons = state[1] || [false, false, false];
    this.delta_x = state[2] || 0;
    this.delta_y = state[3] || 0;
    this.last_toggle = state[4] || false;
};

SerialMouse.prototype.mouse_reset = function()
{
    this.buttons = [false, false, false];
    this.delta_x = 0;
    this.delta_y = 0;
    dbg_log("mouse reset", LOG_SERIAL);
    this.send_to_serial(RESET_DATA);
};

SerialMouse.prototype.send_delta = function(delta_x, delta_y)
{
    const factor = 1;

    this.delta_x += delta_x * factor;
    this.delta_y += delta_y * factor;

    var change_x = this.delta_x | 0,
        change_y = this.delta_y | 0;

    if(change_x || change_y)
    {
        this.delta_x -= change_x;
        this.delta_y -= change_y;

        this.send_mouse_packet(change_x, change_y);
    }
};

SerialMouse.prototype.send_mouse_packet = function(x, y)
{
    if(!this.enabled) return;

    const delta_x = Math.min(Math.max(x, -128), 127);
    const delta_y = -Math.min(Math.max(y, -128), 127);

    this.buffer[0] = 0x40 | ((delta_y & 0b11000000) >> 4) | ((delta_x & 0b11000000) >> 6);
    this.buffer[1] = delta_x & 0b00111111;
    this.buffer[2] = delta_y & 0b00111111;

    // left and right buttons
    this.buffer[0] |= (this.buttons[0] ? 0x20 : 0) | (this.buttons[2] ? 0x10 : 0);

    this.send_to_serial(this.buffer);
};

SerialMouse.prototype.send_middle_button_press = function()
{
    this.serial.data_received(0x20);
};

SerialMouse.prototype.send_to_serial = function(data)
{
    for(var i = 0; i < data.byteLength; i++)
    {
        this.serial.data_received(data[i]);
    }
};

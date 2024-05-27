import * as THREE from 'three';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import Stats from 'three/addons/libs/stats.module';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

const overlay = document.getElementById('overlay');

// add a stats view to the page to monitor performance:
const stats = new Stats();
document.body.appendChild(stats.dom);

const clock = new THREE.Clock();

const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(XRButton.createButton(renderer));

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 5);

scene.add(new THREE.HemisphereLight(0xa5a5a5, 0x898989, 3));

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(1, 1, 1).normalize();
scene.add(light);

const gridHelper = new THREE.GridHelper(10, 10);
scene.add(gridHelper);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  // this fixes the weird exit XR bug:
  if (!renderer.xr.isPresenting)
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// create an AudioListener and add it to the camera
// (this embeds the WebAudio spatialization feature of audioContext.listener)
const listener = new THREE.AudioListener();
camera.add(listener);

// get the AudioContext
const audioContext = listener.context;
// WebAudio requires a click to start audio:
document.body.onclick = () => {
  audioContext.resume();
};

// const navcontrols = new FlyControls(camera, renderer.domElement);
// navcontrols.movementSpeed = 1;
// navcontrols.rollSpeed = Math.PI / 3;
const controls = new OrbitControls(camera, renderer.domElement);

const agent_geometry = new THREE.BoxGeometry(0.5, 2, 0.1).translate(0, 1, 0);
const agent_material = new THREE.MeshStandardMaterial({ color: 0x008ff0 });

let agents = [];
for (let i = 0; i < 10; i++) {
  let position = new THREE.Vector3(
    Math.random() * 10 - 5,
    0,
    Math.random() * 10 - 5
  );

  let mesh = new THREE.Mesh(agent_geometry, agent_material);
  scene.add(mesh);

  agents[i] = {
    position: position,
    velocity: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5),
    mesh: mesh,
  };
}

function animate() {
  // monitor our FPS:
  stats.begin();

  // get current timing:
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  let dir = new THREE.Vector3();
  for (let agent of agents) {
    // let agent change direction:
    dir.randomDirection();
    dir.y = 0;
    agent.velocity.addScaledVector(dir, dt * 3);
    agent.velocity.normalize();
    // let agent wander around:
    agent.position.addScaledVector(agent.velocity, dt);

    // if it wandered too far, reset:
    if (agent.position.length() > 10) {
      agent.position.set(0, 0, 0);
    }

    // make it turn to face where we are going
    agent.mesh.lookAt(agent.position);
    // and then update the position to go there
    agent.mesh.position.copy(agent.position);
  }

  //navcontrols.update(dt);

  overlay.innerText = 'camera position' + JSON.stringify(camera.position);
  overlay.innerText +=
    '\nlistener position' + JSON.stringify(listener.parent.position);

  renderer.render(scene, camera);

  // monitor our FPS:
  stats.end();
}

renderer.setAnimationLoop(animate);

///

async function audiosetup() {
  let response, patcher;
  let patchExportURL = 'fmbell.export.json';
  try {
    response = await fetch(patchExportURL);
    patcher = await response.json();
    console.log('patcher', patcher);
  } catch (err) {
    const errorContext = {
      error: err,
    };
    if (response && (response.status >= 300 || response.status < 200)) {
      (errorContext.header = `Couldn't load patcher export bundle`),
        (errorContext.description =
          `Check app.js to see what file it's trying to load. Currently it's` +
          ` trying to load "${patchExportURL}". If that doesn't` +
          ` match the name of the file you exported from RNBO, modify` +
          ` patchExportURL in app.js.`);
    }
    throw err;
  }

  for (let agent of agents) {
    // create creature sound
    let fmsound = await RNBO.createDevice({ context: audioContext, patcher });
    fmsound.node.parameters.get('carrier').value = Math.random();
    fmsound.node.parameters.get('ratio').value = Math.random();
    fmsound.node.parameters.get('depth').value = Math.random();
    fmsound.node.parameters.get('rate').value = Math.random();

    // create a spatialized sound node:
    const sound = new THREE.PositionalAudio(listener);
    // attach to the sound:
    sound.setNodeSource(fmsound.node);
    // we can also set a volume level here:
    sound.setVolume(1);
    // we can also configure spatialization

    // see https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/distanceModel
    //sound.panner.distanceModel = 'inverse'; // default
    //sound.panner.distanceModel = 'linear';
    //sound.panner.distanceModel = 'exponential';
    // distance at which attenuation starts (meters):
    sound.panner.refDistance = 0.2;
    // for linear model only: distance at which sound is unheard:
    //sound.panner.maxDistance = 6;
    // for inverse & exponential mdoel only:
    // how much sound decays with distance (larger means faster)
    // default 1
    sound.panner.rolloffFactor = 2;
    // see https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/panningModel
    //sound.panner.panningModel = 'equalpower'; // default
    sound.panner.panningModel = 'HRTF';

    // attach to our agent:
    agent.mesh.add(sound);
  }
}

audiosetup();

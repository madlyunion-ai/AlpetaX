import Icon from '@/components/common/Icon/Icon'
import './Tree.scss'

function MapTree() {
  return (
    <div className="map-tree">
      <ul className="tree-group">
        <li className="tree-item">
          <button type="button" className="btn-tree is-seleted">
            <Icon name="arrow-tree" />
            유니온바이오메트릭스
          </button>
          <ul className="tree-children">
            <li className="tree-item">
              <button type="button" className="btn-tree">
                <Icon name="arrow-tree" />
                <span className="text">12층</span>
                <i className="count new">21</i>
              </button>
              <ul className="tree-children">
                <li className="tree-item-box">
                  <button type="button" className="btn-tree-box is-seleted">
                    <span className="text">연구소</span>
                    <i className="count">7</i>
                  </button>
                </li>
                <li className="tree-item-box">
                  <button type="button" className="btn-tree-box">
                    <span className="text">전략기획본부</span>
                    <i className="count">10</i>
                  </button>
                </li>
                <li className="tree-item-box">
                  <button type="button" className="btn-tree-box">
                    <span className="text">품질팀</span>
                    <i className="count">4</i>
                  </button>
                </li>
              </ul>
            </li>
            <li className="tree-item">
              <button type="button" className="btn-tree">
                <Icon name="arrow-tree" />
                <span className="text">13층</span>
                <i className="count new">999</i>
              </button>
            </li>
            <li className="tree-item">
              <button type="button" className="btn-tree">
                <Icon name="arrow-tree" />
                <span className="text">14층</span>
                <i className="count zero">0</i>
              </button>
            </li>
          </ul>
        </li>
      </ul>

      {/* small scale */}
      <ul className="tree-group">
        <li className="tree-item">
          <button type="button" className="btn-tree is-seleted">
            <Icon name="arrow-tree" />
            유니온바이오메트릭스
          </button>
          <ul className="tree-children tree-children-icon">
            <li className="tree-item">
              <button type="button" className="btn-tree-icon">
                <Icon name="tree-terminal" />
                <span className="text">laboratory</span>
              </button>
            </li>
            <li className="tree-item">
              <button type="button" className="btn-tree-icon">
                <Icon name="tree-cctv" />
                <span className="text">hall CCTV</span>
              </button>
            </li>
            <li className="tree-item">
              <button type="button" className="btn-tree-icon">
                <Icon name="tree-terminal" />
                <span className="text">main entrance door</span>
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  )
}

export default MapTree
